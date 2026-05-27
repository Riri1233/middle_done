"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ── Documents Route ───────────────────────────────────────────────────────────
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const db_1 = require("../db");
const claude_1 = require("../services/claude");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
// List documents
router.get('/', async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'))));
    try {
        const [data, total] = await Promise.all([
            db_1.prisma.document.findMany({
                where: { userId: req.user.id },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true, filename: true, originalName: true, mimeType: true,
                    sizeBytes: true, status: true, extracted: true, createdAt: true,
                    _count: { select: { checks: true } },
                },
            }),
            db_1.prisma.document.count({ where: { userId: req.user.id } }),
        ]);
        res.json({ data, total, page });
    }
    catch (err) {
        logger_1.logger.error(err, 'Failed to list documents');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Upload document
router.post('/upload', upload_1.upload.single('file'), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
    }
    const { originalname, filename, mimetype, size, path: filePath } = req.file;
    try {
        const doc = await db_1.prisma.document.create({
            data: {
                userId: req.user.id,
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
            logger_1.logger.error({ err, docId: doc.id }, 'Document processing failed');
        });
        logger_1.logger.info({ docId: doc.id, filename: originalname }, 'Document uploaded');
        res.status(201).json(doc);
    }
    catch (err) {
        logger_1.logger.error(err, 'Failed to save document');
        // Clean up uploaded file on DB error
        fs_1.default.unlink(filePath, () => { });
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get document by ID
router.get('/:id', async (req, res) => {
    try {
        const doc = await db_1.prisma.document.findFirst({
            where: { id: req.params.id, userId: req.user.id },
            include: { checks: { select: { id: true, result: true, createdAt: true } } },
        });
        if (!doc) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.json(doc);
    }
    catch (err) {
        logger_1.logger.error(err, 'Failed to get document');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete document
router.delete('/:id', async (req, res) => {
    try {
        const doc = await db_1.prisma.document.findFirst({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (!doc) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        // Delete file from disk
        fs_1.default.unlink(doc.storagePath, () => { });
        await db_1.prisma.document.delete({ where: { id: doc.id } });
        res.status(204).send();
    }
    catch (err) {
        logger_1.logger.error(err, 'Failed to delete document');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── Background processing ─────────────────────────────────────────────────────
async function processDocument(docId, filePath, mimeType) {
    let text = '';
    try {
        if (mimeType === 'application/pdf') {
            // Dynamically require pdf-parse to avoid issues if not installed
            try {
                const pdfParse = await Promise.resolve().then(() => __importStar(require('pdf-parse')));
                const buffer = fs_1.default.readFileSync(filePath);
                const data = await pdfParse.default(buffer);
                text = data.text;
            }
            catch {
                text = ''; // pdf-parse not available, skip text extraction
            }
        }
        else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mimeType === 'application/msword') {
            try {
                const mammoth = await Promise.resolve().then(() => __importStar(require('mammoth')));
                const result = await mammoth.extractRawText({ path: filePath });
                text = result.value;
            }
            catch {
                text = '';
            }
        }
        else if (mimeType === 'text/plain') {
            text = fs_1.default.readFileSync(filePath, 'utf-8');
        }
        let extracted = {};
        if (text.length > 50) {
            extracted = await (0, claude_1.extractEntitiesFromDocument)(text);
        }
        await db_1.prisma.document.update({
            where: { id: docId },
            data: {
                status: 'done',
                extracted: extracted,
            },
        });
        logger_1.logger.info({ docId, entities: Object.keys(extracted).length }, 'Document processed');
    }
    catch (err) {
        logger_1.logger.error({ err, docId }, 'Document processing error');
        await db_1.prisma.document.update({
            where: { id: docId },
            data: { status: 'error', errorMessage: String(err) },
        });
    }
}
exports.default = router;
//# sourceMappingURL=documents.js.map