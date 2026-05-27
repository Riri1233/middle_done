// ── Review Queue Routes ───────────────────────────────────────────────────────
// Analyst review / escalation workflow:
//   POST /api/checks/:id/flag   → flag a check for analyst review
//   GET  /api/reviews            → list all reviews for current user
//   GET  /api/reviews/stats      → count by status
//   PATCH /api/reviews/:id       → add decision (approve / escalate / reject)
//   DELETE /api/reviews/:id      → remove review flag

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../db';
import { logger } from '../logger';

const router = Router();
router.use(requireAuth);

const flagSchema = z.object({
  notes:    z.string().max(1000).optional(),
  priority: z.enum(['normal', 'high', 'urgent']).default('normal'),
});

const decisionSchema = z.object({
  decision:     z.enum(['approve', 'escalate', 'reject']),
  decisionNote: z.string().max(1000).optional(),
});

// GET /api/reviews/stats — pending count for nav badge
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const pending = await prisma.checkReview.count({
      where: { requestedById: req.user!.id, status: { in: ['pending', 'in_review'] } },
    });
    res.json({ pending });
  } catch (err) {
    logger.error(err, 'review stats failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reviews — list all reviews for current user
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const status = String(req.query.status ?? '');
  try {
    const where: any = { requestedById: req.user!.id };
    if (status && status !== 'all') where.status = status;

    const reviews = await prisma.checkReview.findMany({
      where,
      orderBy: [
        { priority: 'desc' },    // urgent first
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
  } catch (err) {
    logger.error(err, 'list reviews failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/checks/:id/flag — flag check for review
router.post('/checks/:id/flag', validate(flagSchema), async (req: Request, res: Response): Promise<void> => {
  const { notes, priority } = req.body;
  try {
    // Verify the check belongs to this user
    const check = await prisma.check.findFirst({
      where: { id: req.params.id as string, userId: req.user!.id },
    });
    if (!check) { res.status(404).json({ error: 'Check not found' }); return; }

    // Upsert — can re-flag with updated notes
    const review = await prisma.checkReview.upsert({
      where: { checkId: req.params.id as string },
      create: {
        checkId:       req.params.id as string,
        requestedById: req.user!.id,
        notes,
        priority,
        status: 'pending',
      },
      update: {
        notes,
        priority,
        status:      'pending',
        decision:    null,
        decisionNote: null,
        decidedAt:   null,
        decidedById: null,
      },
    });
    logger.info({ reviewId: review.id, checkId: req.params.id as string, priority }, 'Check flagged for review');
    res.status(201).json(review);
  } catch (err) {
    logger.error(err, 'flag review failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/reviews/:id — add analyst decision
router.patch('/:id', validate(decisionSchema), async (req: Request, res: Response): Promise<void> => {
  const { decision, decisionNote } = req.body;
  try {
    const review = await prisma.checkReview.findFirst({
      where: { id: req.params.id as string, requestedById: req.user!.id },
    });
    if (!review) { res.status(404).json({ error: 'Review not found' }); return; }
    if (['approved', 'rejected'].includes(review.status)) {
      res.status(409).json({ error: 'Review already decided' }); return;
    }

    const statusMap: Record<string, string> = {
      approve: 'approved', escalate: 'escalated', reject: 'rejected',
    };

    const updated = await prisma.checkReview.update({
      where: { id: req.params.id as string },
      data: {
        decision,
        decisionNote: decisionNote || null,
        status:       statusMap[decision],
        decidedAt:    new Date(),
        decidedById:  req.user!.id,
      },
    });
    logger.info({ reviewId: req.params.id as string, decision }, 'Review decided');
    res.json(updated);
  } catch (err) {
    logger.error(err, 'decide review failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/reviews/:id — remove flag
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await prisma.checkReview.deleteMany({
      where: { id: req.params.id as string, requestedById: req.user!.id },
    });
    if (deleted.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(204).send();
  } catch (err) {
    logger.error(err, 'delete review failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
