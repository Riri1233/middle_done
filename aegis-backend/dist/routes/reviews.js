"use strict";
// ── Review Queue Routes ───────────────────────────────────────────────────────
// Analyst review / escalation workflow:
//   POST /api/checks/:id/flag   → flag a check for analyst review
//   GET  /api/reviews            → list all reviews for current user
//   GET  /api/reviews/stats      → count by status
//   PATCH /api/reviews/:id       → add decision (approve / escalate / reject)
//   DELETE /api/reviews/:id      → remove review flag
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const db_1 = require("../db");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
const flagSchema = zod_1.z.object({
    notes: zod_1.z.string().max(1000).optional(),
    priority: zod_1.z.enum(['normal', 'high', 'urgent']).default('normal'),
});
const decisionSchema = zod_1.z.object({
    decision: zod_1.z.enum(['approve', 'escalate', 'reject']),
    decisionNote: zod_1.z.string().max(1000).optional(),
});
// GET /api/reviews/stats — pending count for nav badge
router.get('/stats', async (req, res) => {
    try {
        const pending = await db_1.prisma.checkReview.count({
            where: { requestedById: req.user.id, status: { in: ['pending', 'in_review'] } },
        });
        res.json({ pending });
    }
    catch (err) {
        logger_1.logger.error(err, 'review stats failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/reviews — list all reviews for current user
router.get('/', async (req, res) => {
    const status = String(req.query.status ?? '');
    try {
        const where = { requestedById: req.user.id };
        if (status && status !== 'all')
            where.status = status;
        const reviews = await db_1.prisma.checkReview.findMany({
            where,
            orderBy: [
                { priority: 'desc' }, // urgent first
                { createdAt: 'desc' },
            ],
            include: {
                check: {
                    select: {
                        id: true, counterparty: true, country: true,
                        result: true, riskScore: true, createdAt: true, formData: true,
                    },
                },
            },
        });
        res.json(reviews);
    }
    catch (err) {
        logger_1.logger.error(err, 'list reviews failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/checks/:id/flag — flag check for review
router.post('/checks/:id/flag', (0, validate_1.validate)(flagSchema), async (req, res) => {
    const { notes, priority } = req.body;
    try {
        // Verify the check belongs to this user
        const check = await db_1.prisma.check.findFirst({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (!check) {
            res.status(404).json({ error: 'Check not found' });
            return;
        }
        // Upsert — can re-flag with updated notes
        const review = await db_1.prisma.checkReview.upsert({
            where: { checkId: req.params.id },
            create: {
                checkId: req.params.id,
                requestedById: req.user.id,
                notes,
                priority,
                status: 'pending',
            },
            update: {
                notes,
                priority,
                status: 'pending',
                decision: null,
                decisionNote: null,
                decidedAt: null,
                decidedById: null,
            },
        });
        logger_1.logger.info({ reviewId: review.id, checkId: req.params.id, priority }, 'Check flagged for review');
        res.status(201).json(review);
    }
    catch (err) {
        logger_1.logger.error(err, 'flag review failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/reviews/:id — add analyst decision
router.patch('/:id', (0, validate_1.validate)(decisionSchema), async (req, res) => {
    const { decision, decisionNote } = req.body;
    try {
        const review = await db_1.prisma.checkReview.findFirst({
            where: { id: req.params.id, requestedById: req.user.id },
        });
        if (!review) {
            res.status(404).json({ error: 'Review not found' });
            return;
        }
        if (['approved', 'rejected'].includes(review.status)) {
            res.status(409).json({ error: 'Review already decided' });
            return;
        }
        const statusMap = {
            approve: 'approved', escalate: 'escalated', reject: 'rejected',
        };
        const updated = await db_1.prisma.checkReview.update({
            where: { id: req.params.id },
            data: {
                decision,
                decisionNote: decisionNote || null,
                status: statusMap[decision],
                decidedAt: new Date(),
                decidedById: req.user.id,
            },
        });
        logger_1.logger.info({ reviewId: req.params.id, decision }, 'Review decided');
        res.json(updated);
    }
    catch (err) {
        logger_1.logger.error(err, 'decide review failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/reviews/:id — remove flag
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await db_1.prisma.checkReview.deleteMany({
            where: { id: req.params.id, requestedById: req.user.id },
        });
        if (deleted.count === 0) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.status(204).send();
    }
    catch (err) {
        logger_1.logger.error(err, 'delete review failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=reviews.js.map