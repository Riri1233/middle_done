// ── Checks Service v2 ─────────────────────────────────────────────────────────
// Key changes from v1:
//   • Deterministic score calculation (no longer trusting AI-suggested score)
//   • checksLeft enforced + decremented on every check
//   • scoreBreakdown stored for transparency panel
//   • screeningMetadata stored (timing, service availability)
//   • Single source of truth: result.score === Check.riskScore always

import { prisma } from '../db';
import { screenMultiple } from './opensanctions';
import { analyzeCheck } from './claude';
import { CheckFormData } from '../types';
import { logger } from '../logger';

// ── Deterministic score calculation ─────────────────────────────────────────
// AI provides qualitative module assessments (0-100 per module).
// We calculate the final score deterministically — fully transparent and auditable.
const MODULE_WEIGHTS: Record<string, number> = {
  sanctions:     0.35,
  exportControl: 0.25,
  ubo:           0.20,
  payment:       0.12,
  route:         0.08,
};

interface ScoreEntry { score: number; weight: number; contribution: number }

function buildScoreBreakdown(
  modules: Record<string, { score?: number }>,
): Record<string, ScoreEntry> {
  return Object.fromEntries(
    Object.entries(MODULE_WEIGHTS).map(([key, weight]) => {
      const score = modules[key]?.score ?? 50;
      return [key, { score, weight, contribution: Math.round(score * weight * 10) / 10 }];
    }),
  );
}

function calculateScore(breakdown: Record<string, ScoreEntry>): number {
  return Math.round(
    Object.values(breakdown).reduce((sum, e) => sum + e.contribution, 0),
  );
}

// ── List ─────────────────────────────────────────────────────────────────────
interface ListParams {
  userId: string; orgId?: string; page: number; limit: number;
  filter?: string; search?: string;
}

export async function listChecks({ userId, orgId, page, limit, filter, search }: ListParams) {
  const where: Record<string, unknown> = orgId ? { orgId } : { userId };
  if (filter && ['LOW', 'MEDIUM', 'HIGH'].includes(filter)) {
    where.result = { path: ['overall'], equals: filter };
  }
  if (search) where.counterparty = { contains: search, mode: 'insensitive' };

  const [data, total] = await Promise.all([
    prisma.check.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit, take: limit,
      select: {
        id: true, counterparty: true, country: true, product: true,
        currency: true, riskScore: true, source: true, createdAt: true,
        formData: true, result: true, sanctionsHits: true,
      },
    }),
    prisma.check.count({ where }),
  ]);
  return { data, total, page, hasMore: page * limit < total };
}

export async function getCheck(id: string, userId: string) {
  return prisma.check.findFirst({ where: { id, userId } });
}

// ── Create ───────────────────────────────────────────────────────────────────
export async function createCheck(userId: string, formData: CheckFormData) {
  // ── 0. Quota check ──────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  if (user.plan === 'free' && user.checksLeft <= 0) {
    throw Object.assign(
      new Error('Лимит проверок исчерпан. Обновите тарифный план.'),
      { code: 'QUOTA_EXCEEDED' },
    );
  }

  logger.info({ userId, counterparty: formData.cp }, 'Creating check v2');
  const t0 = Date.now();

  // ── 1. OpenSanctions real-time screening ────────────────────────────────
  const entitiesToScreen = [
    { name: formData.cp,  country: formData.country, role: 'counterparty' },
    ...(formData.ubo    ? [{ name: formData.ubo,    country: formData.uboCountry, role: 'ubo' }]    : []),
    ...(formData.vessel ? [{ name: formData.vessel,                               role: 'carrier' }] : []),
  ];

  let sanctionsData: any = null;
  try {
    const screenings = await screenMultiple(entitiesToScreen);
    sanctionsData = {
      counterparty: screenings.find(r => r.role === 'counterparty') ?? null,
      ubo:          screenings.find(r => r.role === 'ubo')          ?? null,
      carrier:      screenings.find(r => r.role === 'carrier')       ?? null,
      screendAt:    new Date().toISOString(),
    };
    logger.info({
      hits: sanctionsData.counterparty?.hits?.length ?? 0,
      sanctioned: sanctionsData.counterparty?.isSanctioned,
      latencyMs: sanctionsData.counterparty?.metadata?.latencyMs,
    }, 'Sanctions screening done');
  } catch (err) {
    logger.error(err, 'Sanctions screening failed — continuing without');
  }

  // ── 2. AI analysis (modules + findings) ────────────────────────────────
  const tAI = Date.now();
  const aiResult = await analyzeCheck(formData, sanctionsData);
  const aiLatencyMs = Date.now() - tAI;

  // ── 3. Deterministic score (transparent, auditable) ────────────────────
  // If sanctioned entity confirmed → force sanctions module to 95
  const cpResult = sanctionsData?.counterparty;
  if (cpResult?.isSanctioned && aiResult.modules?.sanctions) {
    aiResult.modules.sanctions.score  = Math.max(aiResult.modules.sanctions.score ?? 0, 95);
    aiResult.modules.sanctions.risk   = 'HIGH';
    aiResult.modules.sanctions.findings = [
      `ПОДТВЕРЖДЁННЫЙ САНКЦИОННЫЙ ХИТ: ${cpResult.topHit?.caption} (${cpResult.topHit?.sanctionedBy?.join(', ')})`,
      ...(aiResult.modules.sanctions.findings ?? []),
    ];
  }

  const scoreBreakdown = buildScoreBreakdown(aiResult.modules ?? {});
  const calculatedScore = calculateScore(scoreBreakdown);

  // Verdict → recalculate if sanctions confirmed
  let verdict  = aiResult.verdict  ?? 'CAUTION';
  let overall  = aiResult.overall  ?? 'MEDIUM';
  let redFlags = [...(aiResult.red_flags ?? [])];

  if (cpResult?.isSanctioned) {
    verdict  = 'BLOCKED';
    overall  = 'HIGH';
    redFlags = [
      `ПОДТВЕРЖДЁННОЕ САНКЦИОННОЕ СОВПАДЕНИЕ: ${cpResult.topHit?.caption} (${cpResult.topHit?.sanctionedBy?.join(', ')})`,
      ...redFlags,
    ];
  } else if (cpResult?.isHighRisk && verdict === 'APPROVED') {
    verdict = 'CAUTION';
    if (overall === 'LOW') overall = 'MEDIUM';
  }

  // ── 4. Build final result with full metadata ────────────────────────────
  const finalResult = {
    ...aiResult,
    score:           calculatedScore,
    aiSuggestedScore: aiResult.score ?? calculatedScore,
    verdict,
    overall,
    red_flags:       redFlags,
    scoreBreakdown,
    screeningMetadata: {
      opensanctions: {
        searched:      formData.cp,
        latencyMs:     cpResult?.metadata?.latencyMs ?? 0,
        totalHits:     cpResult?.hits?.length ?? 0,
        datasetsChecked: cpResult?.datasetsChecked ?? [],
        serviceAvailable: cpResult?.metadata?.serviceAvailable ?? false,
        checkedAt:     cpResult?.screendAt ?? null,
      },
      ai: {
        model:       'deepseek-chat',
        latencyMs:   aiLatencyMs,
        completedAt: new Date().toISOString(),
      },
      totalLatencyMs: Date.now() - t0,
    },
  };

  // ── 5. Persist ─────────────────────────────────────────────────────────
  const [check] = await prisma.$transaction([
    prisma.check.create({
      data: {
        userId,
        counterparty: formData.cp,
        country:      formData.country,
        product:      formData.product,
        currency:     formData.currency ?? '',
        formData:     formData as any,
        sanctionsHits: sanctionsData as any,
        result:       finalResult as any,
        riskScore:    calculatedScore, // always === result.score
        source:       'manual',
      },
    }),
    // Decrement checksLeft for free tier
    ...(user.plan === 'free'
      ? [prisma.user.update({ where: { id: userId }, data: { checksLeft: { decrement: 1 }, checksUsed: { increment: 1 } } })]
      : [prisma.user.update({ where: { id: userId }, data: { checksUsed: { increment: 1 } } })]),
  ]);

  logger.info({
    checkId: check.id,
    score:   calculatedScore,
    aiScore: aiResult.score,
    verdict,
    totalMs: Date.now() - t0,
  }, 'Check created');

  return check;
}

// ── Delete ────────────────────────────────────────────────────────────────────
export async function deleteCheck(id: string, userId: string): Promise<boolean> {
  const check = await prisma.check.findFirst({ where: { id, userId } });
  if (!check) return false;
  await prisma.check.delete({ where: { id } });
  return true;
}

// ── CSV export ────────────────────────────────────────────────────────────────
export function buildCSV(checks: any[]): string {
  const header = ['ID', 'Дата', 'Контрагент', 'Страна', 'Товар', 'Вердикт', 'Риск-скор', 'Уровень', 'Санкц. хиты'];
  const rows = checks.map(c => {
    const r = c.result as any;
    return [
      c.id,
      new Date(c.createdAt).toISOString(),
      c.counterparty,
      c.country,
      c.product,
      String(r?.verdict ?? ''),
      String(r?.score ?? c.riskScore ?? ''),  // single source via result.score
      String(r?.overall ?? ''),
      String(c.sanctionsHits?.counterparty?.hits?.length ?? 0),
    ];
  });
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  return [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
}

// ── Dashboard stats ───────────────────────────────────────────────────────────
export async function getCheckStats(userId: string) {
  const [total, high, medium, low, agg] = await Promise.all([
    prisma.check.count({ where: { userId } }),
    prisma.check.count({ where: { userId, result: { path: ['overall'], equals: 'HIGH' } } }),
    prisma.check.count({ where: { userId, result: { path: ['overall'], equals: 'MEDIUM' } } }),
    prisma.check.count({ where: { userId, result: { path: ['overall'], equals: 'LOW' } } }),
    prisma.check.aggregate({ where: { userId, riskScore: { not: null } }, _avg: { riskScore: true } }),
  ]);

  const since = new Date(Date.now() - 14 * 86_400_000);
  const recent = await prisma.check.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { createdAt: true, riskScore: true, result: true },
    orderBy: { createdAt: 'asc' },
  });

  return {
    total,
    byRisk: { high, medium, low },
    avgScore: Math.round(agg._avg.riskScore ?? 0),
    trend: recent.map(c => ({
      date:    c.createdAt.toISOString().split('T')[0],
      score:   c.riskScore ?? 0,
      overall: (c.result as any)?.overall ?? 'MEDIUM',
    })),
  };
}
