import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { checkLimiter } from '../middleware/rateLimit';
import { listChecks, getCheck, createCheck, deleteCheck, buildCSV, getCheckStats } from '../services/checks';
import { generateCompliancePDF } from '../services/pdf';
import { prisma } from '../db';
import { logger } from '../logger';

const router = Router();
router.use(requireAuth);

const createCheckSchema = z.object({
  cp:         z.string().min(1),
  country:    z.string().min(1),
  product:    z.string().min(1),
  ctype:      z.string().optional(),
  reg:        z.string().optional(),
  tnved:      z.string().optional(),
  dual:       z.string().optional(),
  enduse:     z.string().optional(),
  ubo:        z.string().optional(),
  uboCountry: z.string().optional(),
  ownership:  z.string().optional(),
  currency:   z.string().optional(),
  val:        z.string().optional(),
  bank:       z.string().optional(),
  payMethod:  z.string().optional(),
  transit:    z.string().optional(),
  vessel:     z.string().optional(),
  finalDest:  z.string().optional(),
});

// Stats
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getCheckStats(req.user!.id));
  } catch (err) {
    logger.error(err, 'stats failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page   = Math.max(1, parseInt(String(req.query.page  ?? '1')));
  const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'))));
  const filter = String(req.query.filter ?? '');
  const search = String(req.query.search ?? '');
  try {
    res.json(await listChecks({ userId: req.user!.id, page, limit, filter: filter || undefined, search: search || undefined }));
  } catch (err) {
    logger.error(err, 'list failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CSV export
router.get('/export/csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await listChecks({ userId: req.user!.id, page: 1, limit: 1000 });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="aegis_checks.csv"');
    res.send('\uFEFF' + buildCSV(result.data));
  } catch (err) {
    logger.error(err, 'CSV export failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const check = await getCheck(String(req.params.id), req.user!.id);
    if (!check) { res.status(404).json({ error: 'Check not found' }); return; }
    res.json(check);
  } catch (err) {
    logger.error(err, 'get check failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PDF
router.get('/:id/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const check = await prisma.check.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!check) { res.status(404).json({ error: 'Check not found' }); return; }

    const pdfBuffer = await generateCompliancePDF({
      id: check.id, createdAt: check.createdAt,
      counterparty: check.counterparty, country: check.country,
      product: check.product, currency: check.currency,
      formData: (check.formData as any) ?? {},
      sanctionsHits: (check.sanctionsHits as any) ?? null,
      result: check.result as any,
      userName: check.user.name, userEmail: check.user.email,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="aegis_check_${check.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    logger.error(err, 'PDF generation failed');
    res.status(500).json({ error: 'Не удалось сгенерировать PDF — попробуйте снова' });
  }
});

// Create
router.post('/', checkLimiter, validate(createCheckSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const check = await createCheck(req.user!.id, req.body);
    res.status(201).json(check);
  } catch (err: any) {
    logger.error(err, 'create check failed');

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
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const ok = await deleteCheck(String(req.params.id), req.user!.id);
    if (!ok) { res.status(404).json({ error: 'Check not found' }); return; }
    res.status(204).send();
  } catch (err) {
    logger.error(err, 'delete failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
