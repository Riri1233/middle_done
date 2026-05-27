"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const pino_http_1 = require("pino-http");
const config_1 = require("./config");
const logger_1 = require("./logger");
const db_1 = require("./db");
const rateLimit_1 = require("./middleware/rateLimit");
const auth_1 = __importDefault(require("./routes/auth"));
const checks_1 = __importDefault(require("./routes/checks"));
const users_1 = __importDefault(require("./routes/users"));
const documents_1 = __importDefault(require("./routes/documents"));
const monitoring_1 = __importDefault(require("./routes/monitoring"));
const reviews_1 = __importDefault(require("./routes/reviews"));
const app = (0, express_1.default)();
app.set('trust proxy', 1);
app.use((0, cors_1.default)({ origin: config_1.config.CORS_ORIGIN, credentials: true }));
app.use(express_1.default.json({ limit: '1mb' }));
app.use((0, pino_http_1.pinoHttp)({ logger: logger_1.logger }));
app.use('/api', rateLimit_1.apiLimiter);
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/checks', checks_1.default);
app.use('/api/users', users_1.default);
app.use('/api/documents', documents_1.default);
app.use('/api/monitoring', monitoring_1.default);
// Review queue — check flagging & analyst decisions
app.use('/api/reviews', reviews_1.default);
app.use('/api', reviews_1.default); // also handles POST /api/checks/:id/flag
// 404
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Error handler
app.use((err, _req, res, _next) => {
    // Handle multer errors
    if (err instanceof Error && err.message.startsWith('Unsupported file type')) {
        res.status(400).json({ error: err.message });
        return;
    }
    logger_1.logger.error(err, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
});
async function main() {
    await db_1.prisma.$connect();
    logger_1.logger.info('Database connected');
    app.listen(config_1.config.PORT, () => {
        logger_1.logger.info({ port: config_1.config.PORT, env: config_1.config.NODE_ENV }, 'Aegis Comply API v2 started');
    });
}
main().catch((err) => {
    logger_1.logger.error(err, 'Failed to start server');
    process.exit(1);
});
process.on('SIGTERM', async () => {
    logger_1.logger.info('SIGTERM received');
    await db_1.prisma.$disconnect();
    process.exit(0);
});
//# sourceMappingURL=index.js.map