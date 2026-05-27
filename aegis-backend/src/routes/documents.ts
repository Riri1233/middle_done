// ── Documents Route ───────────────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { prisma } from '../db';
import { extractEntitiesFromDocument } from '../services/claude';
import { logger } from '../logger';

const router = Router();
router.use(requireAuth);

// List documents
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'))));

  try {
    const [data, total] = await Promise.all([
      prisma.document.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, filename: true, originalName: true, mimeType: true,
          sizeBytes: true, status: true, extracted: true, createdAt: true,
          _count: { select: { checks: true } },
        },
      }),
      prisma.document.count({ where: { userId: req.user!.id } }),
    ]);
    res.json({ data, total, page });
  } catch (err) {
    logger.error(err, 'Failed to list documents');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload document
router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const { originalname, filename, mimetype, size, path: filePath } = req.file;

  try {
    const doc = await prisma.document.create({
      data: {
        userId: req.user!.id,
        filename,
        originalName: originalname,
        mimeType: mimetype,
        sizeBytes: size,
        storagePath: filePath,
        status: 'processing',
      },
    });

    // Process async (don't block response)
    processDocument(doc.id, filePath, mimetype).catch(err => {
      logger.error({ err, docId: doc.id }, 'Document processing failed');
    });

    logger.info({ docId: doc.id, filename: originalname }, 'Document uploaded');
    res.status(201).json(doc);
  } catch (err) {
    logger.error(err, 'Failed to save document');
    // Clean up uploaded file on DB error
    fs.unlink(filePath, () => {});
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get document by ID
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { checks: { select: { id: true, result: true, createdAt: true } } },
    });
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(doc);
  } catch (err) {
    logger.error(err, 'Failed to get document');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete document
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }

    // Delete file from disk
    fs.unlink(doc.storagePath, () => {});
    await prisma.document.delete({ where: { id: doc.id } });
    res.status(204).send();
  } catch (err) {
    logger.error(err, 'Failed to delete document');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Background processing ─────────────────────────────────────────────────────
async function processDocument(docId: string, filePath: string, mimeType: string): Promise<void> {
  let text = '';

  try {
    if (mimeType === 'application/pdf') {
      // Dynamically require pdf-parse to avoid issues if not installed
      try {
        const pdfParse = await import('pdf-parse');
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse.default(buffer);
        text = data.text;
      } catch {
        text = ''; // pdf-parse not available, skip text extraction
      }
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        text = result.value;
      } catch {
        text = '';
      }
    } else if (mimeType === 'text/plain') {
      text = fs.readFileSync(filePath, 'utf-8');
    }

    let extracted: any = {};
    if (text.length > 50) {
      extracted = await extractEntitiesFromDocument(text);
    }

    await prisma.document.update({
      where: { id: docId },
      data: {
        status: 'done',
        extracted: extracted as any,
      },
    });

    logger.info({ docId, entities: Object.keys(extracted).length }, 'Document processed');
  } catch (err) {
    logger.error({ err, docId }, 'Document processing error');
    await prisma.document.update({
      where: { id: docId },
      data: { status: 'error', errorMessage: String(err) },
    });
  }
}

export default router;
