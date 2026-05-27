"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const zod_1 = require("zod");
const db_1 = require("../db");
const config_1 = require("../config");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
const SALT_ROUNDS = 12;
const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function signAccess(userId, email) {
    return jsonwebtoken_1.default.sign({ sub: userId, email }, config_1.config.JWT_SECRET, { expiresIn: ACCESS_TTL });
}
function signRefresh() {
    return (0, uuid_1.v4)();
}
function safeUser(user) {
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
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    name: zod_1.z.string().min(1),
    company: zod_1.z.string().optional().default(''),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
const refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().uuid(),
});
const logoutSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().uuid(),
});
router.post('/register', rateLimit_1.authLimiter, (0, validate_1.validate)(registerSchema), async (req, res) => {
    const { email, password, name, company } = req.body;
    const existing = await db_1.prisma.user.findUnique({ where: { email } });
    if (existing) {
        res.status(409).json({ error: 'Email already registered' });
        return;
    }
    const passwordHash = await bcrypt_1.default.hash(password, SALT_ROUNDS);
    const user = await db_1.prisma.user.create({
        data: { email, passwordHash, name, company },
    });
    const accessToken = signAccess(user.id, user.email);
    const refreshTokenValue = signRefresh();
    await db_1.prisma.refreshToken.create({
        data: {
            token: refreshTokenValue,
            userId: user.id,
            expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
    });
    logger_1.logger.info({ userId: user.id, email }, 'User registered');
    res.status(201).json({ user: safeUser(user), accessToken, refreshToken: refreshTokenValue });
});
router.post('/login', rateLimit_1.authLimiter, (0, validate_1.validate)(loginSchema), async (req, res) => {
    const { email, password } = req.body;
    const user = await db_1.prisma.user.findUnique({ where: { email } });
    if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const valid = await bcrypt_1.default.compare(password, user.passwordHash);
    if (!valid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const accessToken = signAccess(user.id, user.email);
    const refreshTokenValue = signRefresh();
    await db_1.prisma.refreshToken.create({
        data: {
            token: refreshTokenValue,
            userId: user.id,
            expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
    });
    logger_1.logger.info({ userId: user.id }, 'User logged in');
    res.json({ user: safeUser(user), accessToken, refreshToken: refreshTokenValue });
});
router.post('/refresh', (0, validate_1.validate)(refreshSchema), async (req, res) => {
    const { refreshToken } = req.body;
    const stored = await db_1.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date()) {
        if (stored)
            await db_1.prisma.refreshToken.delete({ where: { id: stored.id } });
        res.status(401).json({ error: 'Refresh token expired or invalid' });
        return;
    }
    await db_1.prisma.refreshToken.delete({ where: { id: stored.id } });
    const newAccessToken = signAccess(stored.user.id, stored.user.email);
    const newRefreshToken = signRefresh();
    await db_1.prisma.refreshToken.create({
        data: {
            token: newRefreshToken,
            userId: stored.user.id,
            expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
    });
    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});
router.post('/logout', auth_1.requireAuth, (0, validate_1.validate)(logoutSchema), async (req, res) => {
    const { refreshToken } = req.body;
    await db_1.prisma.refreshToken.deleteMany({ where: { token: refreshToken, userId: req.user.id } });
    logger_1.logger.info({ userId: req.user.id }, 'User logged out');
    res.status(204).send();
});
exports.default = router;
//# sourceMappingURL=auth.js.map