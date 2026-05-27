"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const db_1 = require("../db");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
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
        updatedAt: user.updatedAt,
    };
}
const updateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    company: zod_1.z.string().optional(),
    inn: zod_1.z.string().optional(),
    activity: zod_1.z.string().optional(),
});
router.get('/me', async (req, res) => {
    try {
        const user = await db_1.prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(safeUser(user));
    }
    catch (err) {
        logger_1.logger.error(err, 'Failed to get user');
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.patch('/me', (0, validate_1.validate)(updateSchema), async (req, res) => {
    const { name, company, inn, activity } = req.body;
    try {
        const user = await db_1.prisma.user.update({
            where: { id: req.user.id },
            data: {
                ...(name !== undefined && { name }),
                ...(company !== undefined && { company }),
                ...(inn !== undefined && { inn }),
                ...(activity !== undefined && { activity }),
            },
        });
        res.json(safeUser(user));
    }
    catch (err) {
        logger_1.logger.error(err, 'Failed to update user');
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map