"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// ── Monitoring Route — Watch-list ─────────────────────────────────────────────
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const db_1 = require("../db");
const opensanctions_1 = require("../services/opensanctions");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
const createMonitorSchema = zod_1.z.object({
    entityName: zod_1.z.string().min(2),
    entityCountry: zod_1.z.string().optional(),
    entityType: zod_1.z.string().optional(),
});
// List monitors
router.get('/', async (req, res) => {
    try {
        const monitors = await db_1.prisma.monitor.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
        });
        res.json(monitors);
    }
    catch (err) {
        logger_1.logger.error(err, 'Failed to list monitors');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Create monitor (add to watch-list)
router.post('/', (0, validate_1.validate)(createMonitorSchema), async (req, res) => {
    const { entityName, entityCountry, entityType } = req.body;
    try {
        // Run initial screening
        const screening = await (0, opensanctions_1.screenEntity)(entityName, entityCountry);
        const monitor = await db_1.prisma.monitor.create({
            data: {
                userId: req.user.id,
                entityName,
                entityCountry: entityCountry || null,
                entityType: entityType || null,
                lastCheckedAt: new Date(),
                lastRiskScore: screening.isSanctioned ? 90 : screening.isHighRisk ? 65 : 20,
                alertLevel: screening.isSanctioned ? 'high' : screening.isHighRisk ? 'medium' : 'none',
                hasUnreadAlert: screening.isSanctioned || screening.isHighRisk,
                alertMessage: screening.isSanctioned
                    ? `Обнаружено в санкционных списках: ${screening.topHit?.sanctionedBy?.join(', ')}`
                    : screening.isHighRisk
                        ? `Возможное совпадение в санкционных списках (score: ${Math.round((screening.topHit?.score ?? 0) * 100)}%)`
                        : null,
            },
        });
        logger_1.logger.info({ monitorId: monitor.id, entity: entityName }, 'Monitor created');
        res.status(201).json(monitor);
    }
    catch (err) {
        logger_1.logger.error(err, 'Failed to create monitor');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Re-check a monitor manually
router.post('/:id/recheck', async (req, res) => {
    try {
        const monitor = await db_1.prisma.monitor.findFirst({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (!monitor) {
            res.status(404).json({ error: 'Monitor not found' });
            return;
        }
        const screening = await (0, opensanctions_1.screenEntity)(monitor.entityName, monitor.entityCountry ?? undefined);
        const updated = await db_1.prisma.monitor.update({
            where: { id: monitor.id },
            data: {
                lastCheckedAt: new Date(),
                lastRiskScore: screening.isSanctioned ? 90 : screening.isHighRisk ? 65 : 20,
                alertLevel: screening.isSanctioned ? 'high' : screening.isHighRisk ? 'medium' : 'none',
                hasUnreadAlert: screening.isSanctioned || screening.isHighRisk,
                alertMessage: screening.isSanctioned
                    ? `Обнаружено в санкционных списках: ${screening.topHit?.sanctionedBy?.join(', ')}`
                    : screening.isHighRisk
                        ? `Возможное совпадение (score: ${Math.round((screening.topHit?.score ?? 0) * 100)}%)`
                        : null,
            },
        });
        res.json(updated);
    }
    catch (err) {
        logger_1.logger.error(err, 'Failed to recheck monitor');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Mark alerts as read
router.patch('/:id/read', async (req, res) => {
    try {
        const monitor = await db_1.prisma.monitor.updateMany({
            where: { id: req.params.id, userId: req.user.id },
            data: { hasUnreadAlert: false },
        });
        if (monitor.count === 0) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.status(204).send();
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete monitor
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await db_1.prisma.monitor.deleteMany({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (deleted.count === 0) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.status(204).send();
    }
    catch (err) {
        logger_1.logger.error(err, 'Failed to delete monitor');
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=monitoring.js.map