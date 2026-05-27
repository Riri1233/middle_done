// ── DeepSeek AI Analysis Service ─────────────────────────────────────────────
// Uses real OpenSanctions data as context for more accurate analysis.

import OpenAI from 'openai';
import { config } from '../config';
import { CheckFormData, AnalysisResult } from '../types';
import { logger } from '../logger';

const client = new OpenAI({
  apiKey: config.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const SYSTEM_PROMPT = `You are Aegis Comply AI — a compliance analysis engine for Russian double compliance.
You analyze foreign trade deals for sanctions risk and export control compliance.

STRICT RULES:
1. Respond ONLY with valid JSON, no preamble, no markdown, no backticks.
2. ALL text values must be in Russian.
3. Keep each finding/flag/recommendation under 15 words.
4. No quotes inside string values.
5. verdict: APPROVED | CAUTION | BLOCKED
6. overall/risk: LOW | MEDIUM | HIGH
7. Be specific about which laws/lists apply (e.g., OFAC SDN, ФЗ-183, EU Reg 833/2014).
8. If OpenSanctions found a hit, this is CONFIRMED — do not downplay it.`;

function buildPrompt(f: CheckFormData, sanctionsContext: any): string {
  // Format sanctions context
  let sanctionsInfo = 'OpenSanctions screening: No matches found.';
  if (sanctionsContext?.counterparty?.hits?.length > 0) {
    const top = sanctionsContext.counterparty.topHit;
    sanctionsInfo = `OpenSanctions screening: ${sanctionsContext.counterparty.hits.length} match(es) found.
Top hit: ${top?.caption} | Lists: ${top?.sanctionedBy?.join(', ')} | Score: ${Math.round((top?.score ?? 0) * 100)}%
Is sanctioned: ${sanctionsContext.counterparty.isSanctioned}
Is high risk: ${sanctionsContext.counterparty.isHighRisk}`;
  }
  if (sanctionsContext?.ubo?.hits?.length > 0) {
    sanctionsInfo += `\nUBO screening: ${sanctionsContext.ubo.hits.length} match(es) — ${sanctionsContext.ubo.topHit?.caption}`;
  }

  return `Analyze this trade deal. Respond ONLY with JSON:
{"overall":"HIGH","score":75,"verdict":"BLOCKED","summary":"Two sentences in Russian","red_flags":["flag1","flag2"],"norms":["OFAC SDN","ФЗ-183","EU Reg 833/2014"],"modules":{"sanctions":{"risk":"HIGH","score":80,"findings":["finding1"]},"exportControl":{"risk":"MEDIUM","score":55,"findings":["finding1"]},"ubo":{"risk":"LOW","score":20,"findings":["finding1"]},"payment":{"risk":"HIGH","score":75,"findings":["finding1"]},"route":{"risk":"MEDIUM","score":50,"findings":["finding1"]}},"recs":["rec1","rec2","rec3"]}

=== DEAL DATA ===
Counterparty: ${f.cp}
Country: ${f.country}
Type: ${f.ctype || 'n/a'}
Reg/INN: ${f.reg || 'n/a'}
Product: ${f.product}
HS Code (ТН ВЭД): ${f.tnved || 'n/a'}
Dual-use: ${f.dual || 'unknown'}
End-use: ${f.enduse || 'n/a'}
UBO: ${f.ubo || 'n/a'} (${f.uboCountry || 'n/a'}, ${f.ownership || 'n/a'}%)
Currency: ${f.currency || 'n/a'} | Amount: ${f.val || 'n/a'}
Bank: ${f.bank || 'n/a'} | Payment: ${f.payMethod || 'n/a'}
Transit: ${f.transit || 'direct'} | Carrier: ${f.vessel || 'n/a'}
Final destination: ${f.finalDest || f.country}

=== REAL SANCTIONS DATA (OpenSanctions) ===
${sanctionsInfo}

Instructions:
- If sanctions hit confirmed: verdict=BLOCKED, overall=HIGH, score>=85
- If possible match: verdict=CAUTION, overall>=MEDIUM, score>=60
- Analyze all 5 modules: sanctions, exportControl, ubo, payment, route
- Be specific about which laws/regulations apply
- Give actionable recommendations`;
}

function parseSafeJSON(raw: string): AnalysisResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in DeepSeek response');
  let s = match[0];
  s = s.replace(/(,)(\s*[}\]])/g, '$2');
  s = s.replace(/[\u0000-\u001f]/g, ' ');
  return JSON.parse(s) as AnalysisResult;
}

export async function analyzeCheck(
  formData: CheckFormData,
  sanctionsContext: any = null,
): Promise<AnalysisResult> {
  logger.info({ counterparty: formData.cp }, 'DeepSeek analysis started');

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(formData, sanctionsContext) },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  const result = parseSafeJSON(raw);
  logger.info({ verdict: result.verdict, score: result.score }, 'DeepSeek analysis complete');
  return result;
}

// Extract entities from a document (for document analysis feature)
export async function extractEntitiesFromDocument(text: string): Promise<{
  counterparty?: string;
  country?: string;
  product?: string;
  tnved?: string;
  currency?: string;
  value?: string;
  bank?: string;
}> {
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Extract compliance-relevant entities from a trade document. Return only JSON with fields: counterparty, country, product, tnved, currency, value, bank. Use null for missing fields.',
      },
      {
        role: 'user',
        content: `Extract entities from this document text (first 2000 chars):\n\n${text.slice(0, 2000)}`,
      },
    ],
  });

  try {
    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
