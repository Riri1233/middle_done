// ── Monitoring Route — Watch-list ─────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../db';
import { screenEntity } from '../services/opensanctions';
import { logger } from '../logger';

const router = Router();
router.use(requireAuth);

const createMonitorSchema = z.object({
  entityName: z.string().min(2),
  entityCountry: z.string().optional(),
  entityType: z.string().optional(),
});

// List monitors
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const monitors = await prisma.monitor.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(monitors);
  } catch (err) {
    logger.error(err, 'Failed to list monitors');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create monitor (add to watch-list)
router.post('/', validate(createMonitorSchema), async (req: Request, res: Response): Promise<void> => {
  const { entityName, entityCountry, entityType } = req.body;

  try {
    // Run initial screening
    const screening = await screenEntity(entityName, entityCountry);

    const monitor = await prisma.monitor.create({
      data: {
        userId: req.user!.id,
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

    logger.info({ monitorId: monitor.id, entity: entityName }, 'Monitor created');
    res.status(201).json(monitor);
  } catch (err) {
    logger.error(err, 'Failed to create monitor');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Re-check a monitor manually
router.post('/:id/recheck', async (req: Request, res: Response): Promise<void> => {
  try {
    const monitor = await prisma.monitor.findFirst({
      where: { id: req.params.id as string, userId: req.user!.id },
    });
    if (!monitor) { res.status(404).json({ error: 'Monitor not found' }); return; }

    const screening = await screenEntity(monitor.entityName, monitor.entityCountry ?? undefined);

    const updated = await prisma.monitor.update({
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
  } catch (err) {
    logger.error(err, 'Failed to recheck monitor');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark alerts as read
router.patch('/:id/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const monitor = await prisma.monitor.updateMany({
      where: { id: req.params.id as string, userId: req.user!.id },
      data: { hasUnreadAlert: false },
    });
    if (monitor.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete monitor
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await prisma.monitor.deleteMany({
      where: { id: req.params.id as string, userId: req.user!.id },
    });
    if (deleted.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(204).send();
  } catch (err) {
    logger.error(err, 'Failed to delete monitor');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
