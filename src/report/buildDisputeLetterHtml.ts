import { translator, type Lang } from '@/i18n';
import { depositDueDate, depositSummary, lookupDepositDeadline } from '@/legal/depositDeadlines';

import { conditionLabel, pdfLocale } from './buildReportHtml';
import type { Comparison } from './comparison';
import { escapeHtml } from './escapeHtml';

const STYLE = `
@page { margin: 20mm; }
body { font-family: Georgia, "Times New Roman", serif; color: #111; font-size: 11pt; line-height: 1.5; margin: 0; }
.disclaimer { border: 2px solid #b3261e; color: #b3261e; padding: 6pt 8pt; margin: 0 0 18pt; font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 10pt; }
.placeholder { background: #fff3c4; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 10pt; }
th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f2f2f2; }
`;

const defaultFormatDay = (ms: number, lang: Lang) => new Date(ms).toLocaleDateString(pdfLocale(lang), { year: 'numeric', month: 'long', day: 'numeric' });

/** Something the app does not know: shown in brackets and highlighted for the tenant to fill in. */
const blank = (label: string) => `<span class="placeholder">[${label}]</span>`;
const orBlank = (text: string | null | undefined, label: string) => (text?.trim() ? escapeHtml(text.trim()) : blank(label));

/** Pure: comparison in, a print-ready deposit-return letter out. Every user string goes through escapeHtml. */
export function buildDisputeLetterHtml(c: Comparison, opts?: { formatDate?: (ms: number) => string; lang?: Lang }): string {
  const lang = opts?.lang ?? 'en';
  const t = translator(lang);
  const fmt = opts?.formatDate ?? ((ms: number) => defaultFormatDay(ms, lang));
  const { moveIn, moveOut } = c;
  const tenant = orBlank(moveOut.tenant_name ?? moveIn.tenant_name, t('letter.yourName'));
  const landlord = orBlank(moveOut.landlord_name ?? moveIn.landlord_name, t('letter.landlordName'));
  const property = escapeHtml(moveOut.address) + (moveOut.unit ? t('letter.unit', { unit: escapeHtml(moveOut.unit) }) : '');
  const day = (ms: number | null, label: string) => (ms != null ? fmt(ms) : blank(label));
  const moveOutDay = day(moveOut.move_out_date ?? moveOut.finished_at, t('letter.moveOutDate'));

  // Rows with days: null (KY, TN) still get the summary, which says there is no simple deadline; no due date then.
  const deposit = moveOut.state ? lookupDepositDeadline(moveOut.state) : undefined;
  const due = deposit?.days != null && moveOut.move_out_date != null ? t('letter.due', { date: fmt(depositDueDate(moveOut.move_out_date, deposit.days)) }) : '';
  const depositNote = deposit ? `\n<p>${escapeHtml(depositSummary(deposit))}${due} ${t('deposit.source')}: ${escapeHtml(deposit.source)}.</p>` : '';

  const flagged = c.rooms.flatMap((r) => r.items.filter((i) => i.worsened).map((i) => ({ room: r.name, ...i })));
  // Same or better: both sides recorded and not worse. Items missing on a side or without a condition are left out.
  const notWorse = c.rooms.reduce((n, r) => n + r.items.filter((i) => i.moveIn?.item.condition && i.moveOut?.item.condition && !i.worsened).length, 0);
  const condition = (side: (typeof flagged)[number]['moveIn']) => conditionLabel(t, side?.item.condition ?? null);

  const flaggedSection = flagged.length
    ? `<p>${t(flagged.length === 1 ? 'letter.flagged.one' : 'letter.flagged.other', { n: flagged.length })}</p>
<table><thead><tr><th>${t('common.room')}</th><th>${t('common.item')}</th><th>${t('kind.move_in')}</th><th>${t('kind.move_out')}</th><th>${t('common.note')}</th></tr></thead><tbody>
${flagged
  .map((i) => `<tr><td>${escapeHtml(i.room)}</td><td>${escapeHtml(i.name)}</td><td>${condition(i.moveIn)}</td><td>${condition(i.moveOut)}</td><td>${escapeHtml(i.moveOut?.item.note ?? '')}</td></tr>`)
  .join('\n')}
</tbody></table>`
    : `<p>${t('letter.noneFlagged')}</p>`;

  const evidence = c.moveOutCode
    ? t('letter.evidenceCode', { code: escapeHtml(c.moveOutCode), link: `unscratched.app/v/${escapeHtml(c.moveOutCode)}` })
    : t('letter.evidence');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${t('letter.title')}</title>
<style>${STYLE}</style>
</head>
<body>
<p class="disclaimer"><strong>${t('letter.notAdvice')}</strong> ${t('letter.disclaimer')}</p>
<p>${fmt(c.generatedAt)}</p>
<p>${landlord}<br>${blank(t('letter.landlordAddress'))}</p>
<p><strong>${t('letter.re', { property })}</strong></p>
<p>${t('letter.dear', { name: landlord })}</p>
<p>${t('letter.intro', { property, moveIn: day(moveIn.finished_at, t('letter.moveInDate')), moveOut: moveOutDay, amount: blank(t('letter.amount')) })}</p>${depositNote}
<p>${t(notWorse === 1 ? 'letter.documented.one' : 'letter.documented.other', { n: notWorse })}</p>
${flaggedSection}
<p>${evidence}</p>
<p>${t('letter.sendTo', { address: blank(t('letter.forwarding')) })}</p>
<p>${t('letter.sincerely')}<br>${tenant}</p>
</body>
</html>
`;
}
