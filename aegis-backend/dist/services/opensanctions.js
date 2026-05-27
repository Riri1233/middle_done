"use strict";
// ── OpenSanctions Service v2 ──────────────────────────────────────────────────
// Changes from v1:
//   • Exponential backoff retry (up to 3 attempts)
//   • Per-request timing metadata (latencyMs)
//   • Returns datasetsChecked regardless of hits (for transparency panel)
//   • Graceful degradation: returns emptyResult + flag if service unavailable
Object.defineProperty(exports, "__esModule", { value: true });
exports.screenEntity = screenEntity;
exports.screenMultiple = screenMultiple;
const logger_1 = require("../logger");
const BASE = 'https://api.opensanctions.org';
const SCORE_THRESHOLD = 0.60;
const TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;
const DATASET_LABELS = {
    us_ofac_sdn: 'OFAC SDN', us_ofac_cons: 'OFAC SSI',
    eu_fsf: 'EU Consolidated', un_sc_sanctions: 'UN Security Council',
    gb_hmt_sanctions: 'UK OFSI', us_bis_entities: 'BIS Entity List',
    ru_egrul_sanctions: 'ЕГРЮЛ Sanctions', us_trade_csl: 'US Trade CSL',
};
const DATASETS_CHECKED = [
    'OFAC SDN', 'OFAC SSI', 'EU Consolidated',
    'UN Security Council', 'UK OFSI', 'BIS Entity List',
];
function labelDataset(d) {
    return DATASET_LABELS[d] ?? d.toUpperCase().replace(/_/g, ' ');
}
// Fetch with timeout + exponential backoff
async function fetchWithRetry(url, options) {
    let lastErr = new Error('Unknown');
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s
            await new Promise(r => setTimeout(r, delay));
            logger_1.logger.warn({ attempt, url }, 'OpenSanctions: retry');
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            return { res, retries: attempt };
        }
        catch (err) {
            clearTimeout(timer);
            lastErr = err;
            // Don't retry non-network errors
            if (err.name !== 'AbortError' && err.code !== 'ECONNREFUSED')
                break;
        }
    }
    throw lastErr;
}
async function screenEntity(name, country, schema) {
    const t0 = Date.now();
    logger_1.logger.info({ name, country }, 'OpenSanctions: screening');
    const params = new URLSearchParams({ q: name, limit: '10', dataset: 'default' });
    if (country)
        params.set('countries', country.toLowerCase());
    if (schema)
        params.set('schema', schema);
    const headers = {
        'User-Agent': 'AegisComply/2.0 (compliance@aegis-comply.ru)',
        Accept: 'application/json',
    };
    try {
        const { res, retries } = await fetchWithRetry(`${BASE}/search/default/?${params}`, { headers });
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
            logger_1.logger.warn({ status: res.status }, 'OpenSanctions: non-200');
            return emptyResult(name, latencyMs, true, 0);
        }
        const data = await res.json();
        const raw = (data.results ?? []);
        const hits = raw
            .filter(r => (r.score ?? 0) >= SCORE_THRESHOLD)
            .map(r => {
            const props = r.properties ?? {};
            const datasets = r.datasets ?? [];
            const topics = r.topics ?? [];
            const sanctionedBy = datasets.map(labelDataset);
            const isSanctioned = topics.includes('sanction') ||
                datasets.some(d => ['us_ofac_sdn', 'eu_fsf', 'un_sc_sanctions', 'gb_hmt_sanctions', 'us_ofac_cons'].includes(d));
            return {
                id: r.id,
                caption: r.caption ?? name,
                schema: r.schema ?? 'Unknown',
                score: Math.round((r.score ?? 0) * 100) / 100,
                datasets,
                topics,
                aliases: props.alias ?? [],
                countries: props.country ?? [],
                sanctionedBy,
                isSanctioned,
                isHighConfidence: (r.score ?? 0) >= 0.85,
            };
        });
        const topHit = hits[0] ?? null;
        const isSanctioned = hits.some(h => h.isSanctioned && h.isHighConfidence);
        const isHighRisk = hits.some(h => h.isSanctioned || (h.score >= 0.70 && h.topics.includes('sanction')));
        logger_1.logger.info({ name, hits: hits.length, isSanctioned, latencyMs, retries }, 'OpenSanctions: done');
        return {
            searched: name,
            hits,
            topHit,
            isSanctioned,
            isHighRisk,
            datasetsChecked: DATASETS_CHECKED,
            screendAt: new Date().toISOString(),
            metadata: { latencyMs, serviceAvailable: true, retries },
        };
    }
    catch (err) {
        const latencyMs = Date.now() - t0;
        logger_1.logger.error({ err: err.message, name, latencyMs }, 'OpenSanctions: failed');
        return emptyResult(name, latencyMs, false, MAX_RETRIES);
    }
}
function emptyResult(name, latencyMs, serviceAvailable, retries) {
    return {
        searched: name,
        hits: [],
        topHit: null,
        isSanctioned: false,
        isHighRisk: false,
        datasetsChecked: DATASETS_CHECKED,
        screendAt: new Date().toISOString(),
        metadata: { latencyMs, serviceAvailable, retries },
    };
}
async function screenMultiple(entities) {
    const results = await Promise.all(entities
        .filter(e => e.name && e.name.trim().length > 2)
        .map(async (e) => {
        const result = await screenEntity(e.name, e.country);
        return { ...result, role: e.role };
    }));
    return results;
}
//# sourceMappingURL=opensanctions.js.map