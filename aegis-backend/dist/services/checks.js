"use strict";
// ── Checks Service v2 ─────────────────────────────────────────────────────────
// Key changes from v1:
//   • Deterministic score calculation (no longer trusting AI-suggested score)
//   • checksLeft enforced + decremented on every check
//   • scoreBreakdown stored for transparency panel
//   • screeningMetadata stored (timing, service availability)
//   • Single source of truth: result.score === Check.riskScore always
Object.defineProperty(exports, "__esModule", { value: true });
exports.listChecks = listChecks;
exports.getCheck = getCheck;
exports.createCheck = createCheck;
exports.deleteCheck = deleteCheck;
exports.buildCSV = buildCSV;
exports.getCheckStats = getCheckStats;
const db_1 = require("../db");
const opensanctions_1 = require("./opensanctions");
const claude_1 = require("./claude");
const logger_1 = require("../logger");
// ── Deterministic score calculation ─────────────────────────────────────────
// AI provides qualitative module assessments (0-100 per module).
// We calculate the final score deterministically — fully transparent and auditable.
const MODULE_WEIGHTS = {
    sanctions: 0.35,
    exportControl: 0.25,
    ubo: 0.20,
    payment: 0.12,
    route: 0.08,
};
function buildScoreBreakdown(modules) {
    return Object.fromEntries(Object.entries(MODULE_WEIGHTS).map(([key, weight]) => {
        const score = modules[key]?.score ?? 50;
        return [key, { score, weight, contribution: Math.round(score * weight * 10) / 10 }];
    }));
}
function calculateScore(breakdown) {
    return Math.round(Object.values(breakdown).reduce((sum, e) => sum + e.contribution, 0));
}
async function listChecks({ userId, orgId, page, limit, filter, search }) {
    const where = orgId ? { orgId } : { userId };
    if (filter && ['LOW', 'MEDIUM', 'HIGH'].includes(filter)) {
        where.result = { path: ['overall'], equals: filter };
    }
    if (search)
        where.counterparty = { contains: search, mode: 'insensitive' };
    const [data, total] = await Promise.all([
        db_1.prisma.check.findMany({
            where, orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit, take: limit,
            select: {
                id: true, counterparty: true, country: true, product: true,
                currency: true, riskScore: true, source: true, createdAt: true,
                formData: true, result: true, sanctionsHits: true,
            },
        }),
        db_1.prisma.check.count({ where }),
    ]);
    return { data, total, page, hasMore: page * limit < total };
}
async function getCheck(id, userId) {
    return db_1.prisma.check.findFirst({ where: { id, userId } });
}
// ── Create ───────────────────────────────────────────────────────────────────
async function createCheck(userId, formData) {
    // ── 0. Quota check ──────────────────────────────────────────────────────
    const user = await db_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
        throw new Error('User not found');
    if (user.plan === 'free' && user.checksLeft <= 0) {
        throw Object.assign(new Error('Лимит проверок исчерпан. Обновите тарифный план.'), { code: 'QUOTA_EXCEEDED' });
    }
    logger_1.logger.info({ userId, counterparty: formData.cp }, 'Creating check v2');
    const t0 = Date.now();
    // ── 1. OpenSanctions real-time screening ────────────────────────────────
    const entitiesToScreen = [
        { name: formData.cp, country: formData.country, role: 'counterparty' },
        ...(formData.ubo ? [{ name: formData.ubo, country: formData.uboCountry, role: 'ubo' }] : []),
        ...(formData.vessel ? [{ name: formData.vessel, role: 'carrier' }] : []),
    ];
    let sanctionsData = null;
    try {
        const screenings = await (0, opensanctions_1.screenMultiple)(entitiesToScreen);
        sanctionsData = {
            counterparty: screenings.find(r => r.role === 'counterparty') ?? null,
            ubo: screenings.find(r => r.role === 'ubo') ?? null,
            carrier: screenings.find(r => r.role === 'carrier') ?? null,
            screendAt: new Date().toISOString(),
        };
        logger_1.logger.info({
            hits: sanctionsData.counterparty?.hits?.length ?? 0,
            sanctioned: sanctionsData.counterparty?.isSanctioned,
            latencyMs: sanctionsData.counterparty?.metadata?.latencyMs,
        }, 'Sanctions screening done');
    }
    catch (err) {
        logger_1.logger.error(err, 'Sanctions screening failed — continuing without');
    }
    // ── 2. AI analysis (modules + findings) ────────────────────────────────
    const tAI = Date.now();
    const aiResult = await (0, claude_1.analyzeCheck)(formData, sanctionsData);
    const aiLatencyMs = Date.now() - tAI;
    // ── 3. Deterministic score (transparent, auditable) ────────────────────
    // If sanctioned entity confirmed → force sanctions module to 95
    const cpResult = sanctionsData?.counterparty;
    if (cpResult?.isSanctioned && aiResult.modules?.sanctions) {
        aiResult.modules.sanctions.score = Math.max(aiResult.modules.sanctions.score ?? 0, 95);
        aiResult.modules.sanctions.risk = 'HIGH';
        aiResult.modules.sanctions.findings = [
            `ПОДТВЕРЖДЁННЫЙ САНКЦИОННЫЙ ХИТ: ${cpResult.topHit?.caption} (${cpResult.topHit?.sanctionedBy?.join(', ')})`,
            ...(aiResult.modules.sanctions.findings ?? []),
        ];
    }
    const scoreBreakdown = buildScoreBreakdown(aiResult.modules ?? {});
    const calculatedScore = calculateScore(scoreBreakdown);
    // Verdict → recalculate if sanctions confirmed
    let verdict = aiResult.verdict ?? 'CAUTION';
    let overall = aiResult.overall ?? 'MEDIUM';
    let redFlags = [...(aiResult.red_flags ?? [])];
    if (cpResult?.isSanctioned) {
        verdict = 'BLOCKED';
        overall = 'HIGH';
        redFlags = [
            `ПОДТВЕРЖДЁННОЕ САНКЦИОННОЕ СОВПАДЕНИЕ: ${cpResult.topHit?.caption} (${cpResult.topHit?.sanctionedBy?.join(', ')})`,
            ...redFlags,
        ];
    }
    else if (cpResult?.isHighRisk && verdict === 'APPROVED') {
        verdict = 'CAUTION';
        if (overall === 'LOW')
            overall = 'MEDIUM';
    }
    // ── 4. Build final result with full metadata ────────────────────────────
    const finalResult = {
        ...aiResult,
        score: calculatedScore,
        aiSuggestedScore: aiResult.score ?? calculatedScore,
        verdict,
        overall,
        red_flags: redFlags,
        scoreBreakdown,
        screeningMetadata: {
            opensanctions: {
                searched: formData.cp,
                latencyMs: cpResult?.metadata?.latencyMs ?? 0,
                totalHits: cpResult?.hits?.length ?? 0,
                datasetsChecked: cpResult?.datasetsChecked ?? [],
                serviceAvailable: cpResult?.metadata?.serviceAvailable ?? false,
                checkedAt: cpResult?.screendAt ?? null,
            },
            ai: {
                model: 'deepseek-chat',
                latencyMs: aiLatencyMs,
                completedAt: new Date().toISOString(),
            },
            totalLatencyMs: Date.now() - t0,
        },
    };
    // ── 5. Persist ─────────────────────────────────────────────────────────
    const [check] = await db_1.prisma.$transaction([
        db_1.prisma.check.create({
            data: {
                userId,
                counterparty: formData.cp,
                country: formData.country,
                product: formData.product,
                currency: formData.currency ?? '',
                formData: formData,
                sanctionsHits: sanctionsData,
                result: finalResult,
                riskScore: calculatedScore, // always === result.score
                source: 'manual',
            },
        }),
        // Decrement checksLeft for free tier
        ...(user.plan === 'free'
            ? [db_1.prisma.user.update({ where: { id: userId }, data: { checksLeft: { decrement: 1 }, checksUsed: { increment: 1 } } })]
            : [db_1.prisma.user.update({ where: { id: userId }, data: { checksUsed: { increment: 1 } } })]),
    ]);
    logger_1.logger.info({
        checkId: check.id,
        score: calculatedScore,
        aiScore: aiResult.score,
        verdict,
        totalMs: Date.now() - t0,
    }, 'Check created');
    return check;
}
// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteCheck(id, userId) {
    const check = await db_1.prisma.check.findFirst({ where: { id, userId } });
    if (!check)
        return false;
    await db_1.prisma.check.delete({ where: { id } });
    return true;
}
// ── CSV export ────────────────────────────────────────────────────────────────
function buildCSV(checks) {
    const header = ['ID', 'Дата', 'Контрагент', 'Страна', 'Товар', 'Вердикт', 'Риск-скор', 'Уровень', 'Санкц. хиты'];
    const rows = checks.map(c => {
        const r = c.result;
        return [
            c.id,
            new Date(c.createdAt).toISOString(),
            c.counterparty,
            c.country,
            c.product,
            String(r?.verdict ?? ''),
            String(r?.score ?? c.riskScore ?? ''), // single source via result.score
            String(r?.overall ?? ''),
            String(c.sanctionsHits?.counterparty?.hits?.length ?? 0),
        ];
    });
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    return [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
}
// ── Dashboard stats ───────────────────────────────────────────────────────────
async function getCheckStats(userId) {
    const [total, high, medium, low, agg] = await Promise.all([
        db_1.prisma.check.count({ where: { userId } }),
        db_1.prisma.check.count({ where: { userId, result: { path: ['overall'], equals: 'HIGH' } } }),
        db_1.prisma.check.count({ where: { userId, result: { path: ['overall'], equals: 'MEDIUM' } } }),
        db_1.prisma.check.count({ where: { userId, result: { path: ['overall'], equals: 'LOW' } } }),
        db_1.prisma.check.aggregate({ where: { userId, riskScore: { not: null } }, _avg: { riskScore: true } }),
    ]);
    const since = new Date(Date.now() - 14 * 86_400_000);
    const recent = await db_1.prisma.check.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { createdAt: true, riskScore: true, result: true },
        orderBy: { createdAt: 'asc' },
    });
    return {
        total,
        byRisk: { high, medium, low },
        avgScore: Math.round(agg._avg.riskScore ?? 0),
        trend: recent.map(c => ({
            date: c.createdAt.toISOString().split('T')[0],
            score: c.riskScore ?? 0,
            overall: c.result?.overall ?? 'MEDIUM',
        })),
    };
}
//# sourceMappingURL=checks.js.map