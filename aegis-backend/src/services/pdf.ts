// ── PDF Evidence Vault Generator ─────────────────────────────────────────────
// Generates proper compliance documentation for banks and courts.
// Uses pdfkit for PDF generation.

import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { logger } from '../logger';
import type { SanctionsHit, ScreeningResult } from './opensanctions';

interface PdfCheckData {
  id: string;
  createdAt: Date;
  counterparty: string;
  country: string;
  product: string;
  currency: string;
  formData: Record<string, string>;
  sanctionsHits: ScreeningResult | null;
  result: {
    overall: string;
    score: number;
    verdict: string;
    summary: string;
    red_flags: string[];
    norms: string[];
    modules: Record<string, { risk: string; score: number; findings: string[] }>;
    recs: string[];
  };
  userName: string;
  userEmail: string;
}

const COLORS = {
  navy: '#0B1A3B',
  blue: '#2563EB',
  lightBlue: '#EFF6FF',
  green: '#166534',
  greenBg: '#DCFCE7',
  amber: '#92400E',
  amberBg: '#FEF3C7',
  red: '#7F1D1D',
  redBg: '#FEE2E2',
  gray: '#4B5563',
  lightGray: '#F9FAFB',
  border: '#E5E7EB',
  text: '#111827',
};

function verdictColor(verdict: string): string {
  if (verdict === 'APPROVED') return COLORS.green;
  if (verdict === 'BLOCKED') return COLORS.red;
  return COLORS.amber;
}

function verdictBg(verdict: string): string {
  if (verdict === 'APPROVED') return COLORS.greenBg;
  if (verdict === 'BLOCKED') return COLORS.redBg;
  return COLORS.amberBg;
}

function riskColor(risk: string): string {
  if (risk === 'LOW') return COLORS.green;
  if (risk === 'HIGH') return COLORS.red;
  return COLORS.amber;
}

export async function generateCompliancePDF(check: PdfCheckData): Promise<Buffer> {
  logger.info({ checkId: check.id }, 'Generating compliance PDF');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Aegis Comply — Compliance Dossier ${check.id}`,
        Author: 'Aegis Comply Platform',
        Subject: `Compliance check: ${check.counterparty}`,
        Creator: 'Aegis Comply v2.0',
        Producer: 'pdfkit',
        CreationDate: check.createdAt,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100; // margins
    const col1 = 150;

    // ── Header ───────────────────────────────────────────────────────────────
    // Top bar
    doc.rect(50, 50, pageWidth, 2).fill(COLORS.blue);

    // Shield icon (simplified SVG-like using PDF primitives)
    doc.save()
      .roundedRect(50, 62, 40, 40, 4)
      .fill(COLORS.navy);
    doc.fontSize(22).fillColor('white').text('A', 60, 71);
    doc.restore();

    doc.fillColor(COLORS.navy).fontSize(18).font('Helvetica-Bold')
      .text('AEGIS COMPLY', 100, 66);
    doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica')
      .text('Compliance Intelligence Platform · RegTech', 100, 89);

    // Document metadata (right-aligned)
    doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica')
      .text(`ID: ${check.id}`, 400, 66, { width: pageWidth - 350, align: 'right' })
      .text(`Issued: ${check.createdAt.toLocaleString('ru-RU')}`, 400, 79, { width: pageWidth - 350, align: 'right' })
      .text(`By: ${check.userName}`, 400, 92, { width: pageWidth - 350, align: 'right' });

    doc.rect(50, 112, pageWidth, 1).fill(COLORS.border);

    // ── Title ─────────────────────────────────────────────────────────────────
    doc.moveDown(0.5);
    doc.fillColor(COLORS.navy).fontSize(16).font('Helvetica-Bold')
      .text('COMPLIANCE DOSSIER', 50, 125);
    doc.fillColor(COLORS.gray).fontSize(10).font('Helvetica')
      .text('Evidence vault — for bank or court submission', 50, 144);

    // ── Verdict Banner ────────────────────────────────────────────────────────
    const vColor = verdictColor(check.result.verdict);
    const vBg = verdictBg(check.result.verdict);
    const vLabel = check.result.verdict === 'APPROVED' ? '✓ СДЕЛКА ДОПУСТИМА'
      : check.result.verdict === 'BLOCKED' ? '✗ СДЕЛКА ЗАБЛОКИРОВАНА'
      : '⚠ ТРЕБУЕТ ВНИМАНИЯ';

    doc.rect(50, 162, pageWidth, 46).fill(vBg);
    doc.rect(50, 162, 4, 46).fill(vColor);

    doc.fillColor(vColor).fontSize(14).font('Helvetica-Bold')
      .text(vLabel, 64, 172);
    doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica')
      .text(`Риск-скор: ${check.result.score}/100 · Уровень риска: ${check.result.overall}`, 64, 192);

    // Risk score circle (right side)
    const cx = 480, cy = 185;
    doc.circle(cx, cy, 22).lineWidth(3).strokeColor(vColor).stroke();
    doc.fillColor(vColor).fontSize(14).font('Helvetica-Bold')
      .text(String(check.result.score), cx - 10, cy - 8, { width: 20, align: 'center' });

    // ── Summary ───────────────────────────────────────────────────────────────
    let y = 222;
    doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica-Bold')
      .text('РЕЗЮМЕ АНАЛИЗА', 50, y);
    doc.rect(50, y + 12, pageWidth, 1).fill(COLORS.border);
    y += 20;

    doc.fillColor(COLORS.text).fontSize(10).font('Helvetica')
      .text(check.result.summary, 50, y, { width: pageWidth });
    y = doc.y + 16;

    // ── Object of Check ───────────────────────────────────────────────────────
    doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica-Bold')
      .text('ОБЪЕКТ ПРОВЕРКИ', 50, y);
    doc.rect(50, y + 12, pageWidth, 1).fill(COLORS.border);
    y += 20;

    const fields: [string, string][] = [
      ['Контрагент', check.counterparty],
      ['Страна регистрации', check.country],
      ['Товар / технология', check.product],
      ['Код ТН ВЭД', check.formData?.tnved || '—'],
      ['Двойное назначение', check.formData?.dual || '—'],
      ['Валюта расчёта', check.currency || '—'],
      ['Сумма сделки', check.formData?.val || '—'],
      ['Банк', check.formData?.bank || '—'],
      ['Маршрут', check.formData?.transit || 'Прямой'],
      ['UBO', check.formData?.ubo || '—'],
    ];

    for (const [label, value] of fields) {
      if (value && value !== '—') {
        doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica').text(label, 50, y, { width: col1 });
        doc.fillColor(COLORS.text).fontSize(9).font('Helvetica-Bold').text(value, 50 + col1, y, { width: pageWidth - col1 });
        y += 16;
      }
    }
    y += 4;

    // ── Sanctions Screening ───────────────────────────────────────────────────
    if (check.sanctionsHits) {
      doc.rect(50, y, pageWidth, 1).fill(COLORS.border);
      y += 8;
      doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica-Bold')
        .text('РЕЗУЛЬТАТЫ САНКЦИОННОГО СКРИНИНГА', 50, y);
      doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica')
        .text(`(OpenSanctions · ${check.sanctionsHits.datasetsChecked.join(' · ')})`, 50, y + 13);
      y += 28;

      if (check.sanctionsHits.hits.length === 0) {
        doc.rect(50, y, pageWidth, 24).fill('#F0FDF4');
        doc.fillColor(COLORS.green).fontSize(9).font('Helvetica-Bold')
          .text('✓ Совпадений в санкционных списках не обнаружено', 58, y + 7);
        y += 34;
      } else {
        for (const hit of check.sanctionsHits.hits.slice(0, 3)) {
          const hitBg = hit.isSanctioned ? COLORS.redBg : COLORS.amberBg;
          const hitColor = hit.isSanctioned ? COLORS.red : COLORS.amber;
          doc.rect(50, y, pageWidth, 36).fill(hitBg);
          doc.rect(50, y, 3, 36).fill(hitColor);
          doc.fillColor(hitColor).fontSize(9).font('Helvetica-Bold')
            .text(`${hit.isSanctioned ? '⚠ SANCTION HIT' : '⚡ POSSIBLE MATCH'}: ${hit.caption}`, 58, y + 6);
          doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica')
            .text(`Lists: ${hit.sanctionedBy.join(', ') || '—'} · Schema: ${hit.schema} · Score: ${(hit.score * 100).toFixed(0)}%`, 58, y + 20);
          y += 44;
        }
      }
    }

    // ── Check new page if needed ──────────────────────────────────────────────
    if (y > 650) { doc.addPage(); y = 50; }

    // ── Module Analysis ───────────────────────────────────────────────────────
    doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica-Bold')
      .text('АНАЛИЗ ПО МОДУЛЯМ', 50, y);
    doc.rect(50, y + 12, pageWidth, 1).fill(COLORS.border);
    y += 20;

    const moduleNames: Record<string, string> = {
      sanctions: 'Санкционный скрининг',
      exportControl: 'Экспортный контроль',
      ubo: 'UBO / Правило 50%',
      payment: 'Платёжный коридор',
      route: 'Маршрут / Антиобход',
    };

    for (const [key, module] of Object.entries(check.result.modules ?? {})) {
      const mName = moduleNames[key] ?? key;
      const mColor = riskColor(module.risk);

      doc.fillColor(COLORS.text).fontSize(9).font('Helvetica-Bold').text(mName, 50, y);
      doc.fillColor(mColor).fontSize(9).font('Helvetica-Bold').text(`${module.risk} · ${module.score}/100`, 300, y, { width: 200, align: 'right' });
      y += 14;

      // Score bar
      const barW = pageWidth * 0.6;
      doc.rect(50, y, barW, 4).fill(COLORS.border);
      doc.rect(50, y, barW * module.score / 100, 4).fill(mColor);
      y += 12;

      for (const finding of (module.findings ?? []).slice(0, 2)) {
        doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica')
          .text(`• ${finding}`, 60, y, { width: pageWidth - 10 });
        y += 12;
      }
      y += 6;
    }

    // ── Red Flags ─────────────────────────────────────────────────────────────
    if (check.result.red_flags?.length > 0) {
      if (y > 620) { doc.addPage(); y = 50; }
      doc.rect(50, y, pageWidth, 1).fill(COLORS.border);
      y += 8;
      doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica-Bold').text('РИЧ-ФАКТОРЫ (RED FLAGS)', 50, y);
      y += 16;
      for (const flag of check.result.red_flags) {
        doc.rect(50, y, pageWidth, 18).fill(COLORS.redBg);
        doc.fillColor(COLORS.red).fontSize(8).font('Helvetica').text(`⚠  ${flag}`, 58, y + 4, { width: pageWidth - 16 });
        y += 22;
      }
      y += 6;
    }

    // ── Applied Norms ─────────────────────────────────────────────────────────
    if (check.result.norms?.length > 0) {
      if (y > 650) { doc.addPage(); y = 50; }
      doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica-Bold').text('ПРИМЕНИМЫЕ НОРМЫ', 50, y);
      y += 14;
      let x = 50;
      for (const norm of check.result.norms) {
        const w = doc.widthOfString(norm) + 16;
        if (x + w > pageWidth + 50) { x = 50; y += 18; }
        doc.rect(x, y, w, 16).fill(COLORS.lightBlue);
        doc.fillColor(COLORS.blue).fontSize(8).font('Helvetica').text(norm, x + 8, y + 3);
        x += w + 6;
      }
      y += 24;
    }

    // ── Recommendations ───────────────────────────────────────────────────────
    if (check.result.recs?.length > 0) {
      if (y > 620) { doc.addPage(); y = 50; }
      doc.rect(50, y, pageWidth, 1).fill(COLORS.border);
      y += 8;
      doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica-Bold').text('РЕКОМЕНДАЦИИ', 50, y);
      y += 16;
      check.result.recs.forEach((rec, i) => {
        doc.fillColor(COLORS.blue).fontSize(9).font('Helvetica-Bold').text(`${i + 1}.`, 50, y, { width: 20 });
        doc.fillColor(COLORS.text).fontSize(9).font('Helvetica').text(rec, 70, y, { width: pageWidth - 20 });
        y = doc.y + 8;
      });
    }

    // ── Footer (all pages) ────────────────────────────────────────────────────
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.rect(50, doc.page.height - 60, pageWidth, 1).fill(COLORS.border);
      doc.fillColor(COLORS.gray).fontSize(7).font('Helvetica')
        .text(
          `Aegis Comply · aegis-comply.ru · ID: ${check.id} · ${check.createdAt.toISOString()} · Page ${i + 1} of ${pages.count}`,
          50, doc.page.height - 48, { width: pageWidth, align: 'center' },
        );
      doc.fillColor(COLORS.gray).fontSize(7)
        .text(
          'DISCLAIMER: Данный отчёт сформирован AI-системой Aegis Comply как справочный материал. Не является юридическим заключением. Финальное решение — за комплаенс-офицером.',
          50, doc.page.height - 34, { width: pageWidth, align: 'center' },
        );
    }

    doc.end();
  });
}
