// ── Aegis Comply · API Service v2 ─────────────────────────────────────────────
const API_BASE_URL = 'https://aegis-api-filz.onrender.com';

export const getAccessToken  = () => localStorage.getItem('aegis_access') ?? '';
export const getRefreshToken = () => localStorage.getItem('aegis_refresh') ?? '';
export const storeTokens = (a: string, r: string) => {
  localStorage.setItem('aegis_access', a);
  localStorage.setItem('aegis_refresh', r);
};
export const clearTokens = () => {
  localStorage.removeItem('aegis_access');
  localStorage.removeItem('aegis_refresh');
};

// ── Core fetch with auto-refresh ──────────────────────────────────────────────
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const go = (token: string) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers, Authorization: `Bearer ${token}` },
    });

  let res = await go(getAccessToken());

  if (res.status === 401) {
    const rf = getRefreshToken();
    if (rf) {
      const rr = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rf }),
      });
      if (rr.ok) {
        const d = await rr.json();
        storeTokens(d.accessToken, d.refreshToken);
        res = await go(d.accessToken);
      } else {
        clearTokens();
        // Dispatch event so App can show a proper modal (not just a toast)
        window.dispatchEvent(new CustomEvent('aegis:session-expired'));
        throw new Error('SESSION_EXPIRED');
      }
    }
  }
  return res;
}

// Throws with server error message or falls through on 204
async function parseOrThrow(res: Response) {
  if (res.status === 204) return null;
  // Rate limit — extract Retry-After header for user-friendly message
  if (res.status === 429) {
    const after = res.headers.get('Retry-After');
    const sec = after ? parseInt(after) : 60;
    throw Object.assign(
      new Error(`Слишком много запросов. Подождите ${sec} секунд.`),
      { code: 'RATE_LIMITED' }
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = Object.assign(new Error(data?.error ?? `HTTP ${res.status}`), { code: data?.code });
    throw err;
  }
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export interface ApiUser {
  id: string; email: string; name: string; company: string;
  inn: string; activity: string; plan: string; checksLeft: number; checksUsed: number; createdAt: string;
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const data = await parseOrThrow(res);
  storeTokens(data.accessToken, data.refreshToken);
  return data as { user: ApiUser };
}
export async function apiRegister(email: string, password: string, name: string, company: string) {
  const res = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name, company }) });
  const data = await parseOrThrow(res);
  storeTokens(data.accessToken, data.refreshToken);
  return data as { user: ApiUser };
}
export async function apiLogout() {
  const rf = getRefreshToken();
  if (rf) await apiFetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: rf }) }).catch(() => {});
  clearTokens();
}
export async function apiGetMe(): Promise<ApiUser> { return parseOrThrow(await apiFetch('/api/users/me')); }
export async function apiUpdateMe(d: any): Promise<ApiUser> { return parseOrThrow(await apiFetch('/api/users/me', { method: 'PATCH', body: JSON.stringify(d) })); }

// ── Checks ────────────────────────────────────────────────────────────────────
export interface SanctionsHit {
  id: string; caption: string; schema: string; score: number;
  datasets: string[]; sanctionedBy: string[]; isSanctioned: boolean; isHighConfidence: boolean;
}
export interface ScreeningResult {
  searched: string; hits: SanctionsHit[]; topHit: SanctionsHit | null;
  isSanctioned: boolean; isHighRisk: boolean; datasetsChecked: string[]; screendAt: string;
  metadata: { latencyMs: number; serviceAvailable: boolean; retries: number };
}
export interface ScoreEntry { score: number; weight: number; contribution: number }
export interface AnalysisResult {
  overall: string; score: number; aiSuggestedScore?: number;
  verdict: string; summary: string; red_flags: string[];
  norms: string[];
  modules: Record<string, { risk: string; score: number; findings: string[] }>;
  recs: string[];
  scoreBreakdown?: Record<string, ScoreEntry>;
  screeningMetadata?: {
    opensanctions: { searched: string; latencyMs: number; totalHits: number; datasetsChecked: string[]; serviceAvailable: boolean; checkedAt: string | null };
    ai: { model: string; latencyMs: number; completedAt: string };
    totalLatencyMs: number;
  };
}
export interface ApiCheck {
  id: string; counterparty: string; country: string; product: string;
  currency: string; riskScore: number | null; source: string;
  formData: Record<string, string>; result: AnalysisResult | null;
  sanctionsHits: { counterparty: ScreeningResult | null } | null;
  createdAt: string;
}

export async function apiListChecks(p?: { page?: number; limit?: number; filter?: string; search?: string }) {
  const q = new URLSearchParams();
  if (p?.page) q.set('page', String(p.page));
  if (p?.limit) q.set('limit', String(p.limit));
  if (p?.filter && p.filter !== 'ALL') q.set('filter', p.filter);
  if (p?.search) q.set('search', p.search);
  return parseOrThrow(await apiFetch(`/api/checks?${q}`)) as Promise<{ data: ApiCheck[]; total: number; page: number }>;
}
export async function apiGetStats() { return parseOrThrow(await apiFetch('/api/checks/stats')); }
export async function apiCreateCheck(f: Record<string, string>): Promise<ApiCheck> {
  return parseOrThrow(await apiFetch('/api/checks', { method: 'POST', body: JSON.stringify(f) }));
}
export async function apiDeleteCheck(id: string) {
  await parseOrThrow(await apiFetch(`/api/checks/${id}`, { method: 'DELETE' }));
}
export async function apiDownloadPDF(checkId: string, filename: string) {
  const res = await apiFetch(`/api/checks/${checkId}/pdf`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.error ?? 'Не удалось сгенерировать PDF');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function apiExportCSV() {
  const res = await apiFetch('/api/checks/export/csv');
  if (!res.ok) throw new Error('Экспорт не удался');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'aegis_checks.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Documents ─────────────────────────────────────────────────────────────────
export interface ApiDocument {
  id: string; originalName: string; mimeType: string; sizeBytes: number;
  status: string; extracted: Record<string, string> | null; createdAt: string;
  _count?: { checks: number };
}
export async function apiListDocuments(): Promise<{ data: ApiDocument[]; total: number }> {
  return parseOrThrow(await apiFetch('/api/documents'));
}
export async function apiUploadDocumentRaw(file: File): Promise<ApiDocument> {
  const form = new FormData(); form.append('file', file);
  let res = await fetch(`${BASE}/api/documents/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${getAccessToken()}` }, body: form,
  });
  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  return parseOrThrow(res);
}
export async function apiDeleteDocument(id: string) {
  await parseOrThrow(await apiFetch(`/api/documents/${id}`, { method: 'DELETE' }));
}

// ── Monitoring ────────────────────────────────────────────────────────────────
export interface ApiMonitor {
  id: string; entityName: string; entityCountry: string | null;
  isActive: boolean; lastCheckedAt: string | null; lastRiskScore: number | null;
  alertLevel: string | null; hasUnreadAlert: boolean; alertMessage: string | null; createdAt: string;
}
export async function apiListMonitors(): Promise<ApiMonitor[]> {
  return parseOrThrow(await apiFetch('/api/monitoring'));
}
export async function apiCreateMonitor(d: { entityName: string; entityCountry?: string }): Promise<ApiMonitor> {
  return parseOrThrow(await apiFetch('/api/monitoring', { method: 'POST', body: JSON.stringify(d) }));
}
export async function apiRecheckMonitor(id: string): Promise<ApiMonitor> {
  return parseOrThrow(await apiFetch(`/api/monitoring/${id}/recheck`, { method: 'POST' }));
}
export async function apiMarkMonitorRead(id: string) {
  await parseOrThrow(await apiFetch(`/api/monitoring/${id}/read`, { method: 'PATCH' }));
}
export async function apiDeleteMonitor(id: string) {
  await parseOrThrow(await apiFetch(`/api/monitoring/${id}`, { method: 'DELETE' }));
}

// ── Review Queue ─────────────────────────────────────────────────────────────
export interface ApiReview {
  id: string;
  checkId: string;
  status: string;          // pending | in_review | approved | escalated | rejected
  priority: string;        // normal | high | urgent
  notes: string | null;
  decision: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  check: {
    id: string; counterparty: string; country: string;
    result: any; riskScore: number | null; createdAt: string;
    formData: Record<string, string>;
  };
}
export async function apiListReviews(status?: string): Promise<ApiReview[]> {
  const q = status ? `?status=${status}` : '';
  return parseOrThrow(await apiFetch(`/api/reviews${q}`));
}
export async function apiGetReviewStats(): Promise<{ pending: number }> {
  return parseOrThrow(await apiFetch('/api/reviews/stats'));
}
export async function apiFlagCheck(checkId: string, data: { notes?: string; priority: string }): Promise<ApiReview> {
  return parseOrThrow(await apiFetch(`/api/checks/${checkId}/flag`, {
    method: 'POST', body: JSON.stringify(data),
  }));
}
export async function apiDecideReview(reviewId: string, data: { decision: string; decisionNote?: string }): Promise<ApiReview> {
  return parseOrThrow(await apiFetch(`/api/reviews/${reviewId}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }));
}
export async function apiDeleteReview(reviewId: string): Promise<void> {
  await parseOrThrow(await apiFetch(`/api/reviews/${reviewId}`, { method: 'DELETE' }));
}

// ── Map backend check → normalised frontend item ──────────────────────────────
// Single source of truth for score: always use result.score (= riskScore in DB)
export function mapCheck(c: ApiCheck) {
  const score = c.result?.score ?? c.riskScore ?? 0;   // guaranteed consistent
  return {
    id:           c.id,
    counterparty: c.counterparty,
    country:      c.country,
    product:      c.product,
    currency:     c.currency,
    score,                                              // top-level, no more dual reads
    source:       c.source,
    date:         c.createdAt,
    form:         c.formData,
    sanctionsHits: c.sanctionsHits,
    result: c.result
      ? {
          ...c.result,
          score,                                        // normalised into result too
          checkRecord: {
            id: c.id, date: c.createdAt,
            counterparty: c.counterparty, country: c.country,
            currency: c.currency, form: c.formData,
          },
        }
      : null,
  };
}
