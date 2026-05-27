import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../db';
import { logger } from '../logger';

const router = Router();

router.use(requireAuth);

function safeUser(user: {
  id: string;
  email: string;
  name: string;
  company: string;
  inn: string;
  activity: string;
  plan: string;
  checksLeft: number;
  createdAt: Date;
  updatedAt: Date;
}) {
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
    updatedAt: user.updatedAt,
  };
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  company: z.string().optional(),
  inn: z.string().optional(),
  activity: z.string().optional(),
});

router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(safeUser(user));
  } catch (err) {
    logger.error(err, 'Failed to get user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/me', validate(updateSchema), async (req: Request, res: Response): Promise<void> => {
  const { name, company, inn, activity } = req.body as z.infer<typeof updateSchema>;

  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(name !== undefined && { name }),
        ...(company !== undefined && { company }),
        ...(inn !== undefined && { inn }),
        ...(activity !== undefined && { activity }),
      },
    });
    res.json(safeUser(user));
  } catch (err) {
    logger.error(err, 'Failed to update user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
