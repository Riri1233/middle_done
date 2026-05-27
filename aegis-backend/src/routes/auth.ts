import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { prisma } from '../db';
import { config } from '../config';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { logger } from '../logger';

const router = Router();

const SALT_ROUNDS = 12;
const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signAccess(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, config.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefresh() {
  return uuidv4();
}

function safeUser(user: { id: string; email: string; name: string; company: string; inn: string; activity: string; plan: string; checksLeft: number; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company,
    inn: user.inn,
    activity: user.activity,
    plan: user.plan,
    checksLeft: user.checksLeft,
    createdAt: user.createdAt,
  };
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1),
  company: z.string().optional().default(''),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().uuid(),
});

const logoutSchema = z.object({
  refreshToken: z.string().uuid(),
});

router.post('/register', authLimiter, validate(registerSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, password, name, company } = req.body as z.infer<typeof registerSchema>;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, company },
  });

  const accessToken = signAccess(user.id, user.email);
  const refreshTokenValue = signRefresh();

  await prisma.refreshToken.create({
    data: {
      token: refreshTokenValue,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  logger.info({ userId: user.id, email }, 'User registered');
  res.status(201).json({ user: safeUser(user), accessToken, refreshToken: refreshTokenValue });
});

router.post('/login', authLimiter, validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const accessToken = signAccess(user.id, user.email);
  const refreshTokenValue = signRefresh();

  await prisma.refreshToken.create({
    data: {
      token: refreshTokenValue,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  logger.info({ userId: user.id }, 'User logged in');
  res.json({ user: safeUser(user), accessToken, refreshToken: refreshTokenValue });
});

router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
    res.status(401).json({ error: 'Refresh token expired or invalid' });
    return;
  }

  await prisma.refreshToken.delete({ where: { id: stored.id } });

  const newAccessToken = signAccess(stored.user.id, stored.user.email);
  const newRefreshToken = signRefresh();

  await prisma.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: stored.user.id,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

router.post('/logout', requireAuth, validate(logoutSchema), async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as z.infer<typeof logoutSchema>;

  await prisma.refreshToken.deleteMany({ where: { token: refreshToken, userId: req.user!.id } });

  logger.info({ userId: req.user!.id }, 'User logged out');
  res.status(204).send();
});

export default router;
