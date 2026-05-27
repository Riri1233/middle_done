"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const rateLimit_1 = require("../middleware/rateLimit");
const checks_1 = require("../services/checks");
const pdf_1 = require("../services/pdf");
const db_1 = require("../db");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
const createCheckSchema = zod_1.z.object({
    cp: zod_1.z.string().min(1),
    country: zod_1.z.string().min(1),
    product: zod_1.z.string().min(1),
    ctype: zod_1.z.string().optional(),
    reg: zod_1.z.string().optional(),
    tnved: zod_1.z.string().optional(),
    dual: zod_1.z.string().optional(),
    enduse: zod_1.z.string().optional(),
    ubo: zod_1.z.string().optional(),
    uboCountry: zod_1.z.string().optional(),
    ownership: zod_1.z.string().optional(),
    currency: zod_1.z.string().optional(),
    val: zod_1.z.string().optional(),
    bank: zod_1.z.string().optional(),
    payMethod: zod_1.z.string().optional(),
    transit: zod_1.z.string().optional(),
    vessel: zod_1.z.string().optional(),
    finalDest: zod_1.z.string().optional(),
});
// Stats
router.get('/stats', async (req, res) => {
    try {
        res.json(await (0, checks_1.getCheckStats)(req.user.id));
    }
    catch (err) {
        logger_1.logger.error(err, 'stats failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// List
router.get('/', async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'))));
    const filter = String(req.query.filter ?? '');
    const search = String(req.query.search ?? '');
    try {
        res.json(await (0, checks_1.listChecks)({ userId: req.user.id, page, limit, filter: filter || undefined, search: search || undefined }));
    }
    catch (err) {
        logger_1.logger.error(err, 'list failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// CSV export
router.get('/export/csv', async (req, res) => {
    try {
        const result = await (0, checks_1.listChecks)({ userId: req.user.id, page: 1, limit: 1000 });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="aegis_checks.csv"');
        res.send('\uFEFF' + (0, checks_1.buildCSV)(result.data));
    }
    catch (err) {
        logger_1.logger.error(err, 'CSV export failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get single
router.get('/:id', async (req, res) => {
    try {
        const check = await (0, checks_1.getCheck)(String(req.params.id), req.user.id);
        if (!check) {
            res.status(404).json({ error: 'Check not found' });
            return;
        }
        res.json(check);
    }
    catch (err) {
        logger_1.logger.error(err, 'get check failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PDF
router.get('/:id/pdf', async (req, res) => {
    try {
        const check = await db_1.prisma.check.findFirst({
            where: { id: req.params.id, userId: req.user.id },
            include: { user: true }
        });
        if (!check) {
            res.status(404).json({ error: 'Check not found' });
            return;
        }
        const pdfBuffer = await (0, pdf_1.generateCompliancePDF)({
            id: check.id, createdAt: check.createdAt,
            counterparty: check.counterparty, country: check.country,
            product: check.product, currency: check.currency,
            formData: check.formData ?? {},
            sanctionsHits: check.sanctionsHits ?? null,
            result: check.result,
            userName: check.user.name, userEmail: check.user.email,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="aegis_check_${check.id}.pdf"`);
        res.send(pdfBuffer);
    }
    catch (err) {
        logger_1.logger.error(err, 'PDF generation failed');
        res.status(500).json({ error: 'Не удалось сгенерировать PDF — попробуйте снова' });
    }
});
// Create
router.post('/', rateLimit_1.checkLimiter, (0, validate_1.validate)(createCheckSchema), async (req, res) => {
    try {
        const check = await (0, checks_1.createCheck)(req.user.id, req.body);
        res.status(201).json(check);
    }
    catch (err) {
        logger_1.logger.error(err, 'create check failed');
        // Quota exceeded → 402
        if (err.code === 'QUOTA_EXCEEDED') {
            res.status(402).json({ error: err.message, code: 'QUOTA_EXCEEDED' });
            return;
        }
        // AI unavailable → 502
        if (err.message?.includes('DeepSeek') || err.message?.includes('deepseek')) {
            res.status(502).json({ error: 'AI-анализ временно недоступен. Попробуйте через несколько секунд.', code: 'AI_UNAVAILABLE' });
            return;
        }
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});
// Delete
router.delete('/:id', async (req, res) => {
    try {
        const ok = await (0, checks_1.deleteCheck)(String(req.params.id), req.user.id);
        if (!ok) {
            res.status(404).json({ error: 'Check not found' });
            return;
        }
        res.status(204).send();
    }
    catch (err) {
        logger_1.logger.error(err, 'delete failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=checks.js.map