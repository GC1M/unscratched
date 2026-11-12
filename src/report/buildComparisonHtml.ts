import type { Photo } from '@/db/types';
import { translator, type Lang, type T } from '@/i18n';
import { depositDueDate, depositSummary, lookupDepositDeadline } from '@/legal/depositDeadlines';
import { type DepositSplit, formatMoney, parseDepositSplit, settleDeposit } from '@/lib/depositSplit';

import { conditionLabel, defaultFormatDate, pdfLocale, receiptLine, verificationText } from './buildReportHtml';
import type { Comparison, ComparisonItem } from './comparison';
import { escapeHtml } from './escapeHtml';
import type { ReportItem } from './types';

const STYLE = `
@page { margin: 16mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.4; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-size: 22pt; margin: 0 0 12pt; }
h2 { font-size: 16pt; margin: 0 0 8pt; }
h3 { font-size: 12pt; margin: 12pt 0 4pt; }
.cover dl { display: grid; grid-template-columns: max-content 1fr; gap: 4pt 12pt; margin: 0 0 16pt; }
.cover dt { font-weight: 600; }
.cover dd { margin: 0; }
.room { page-break-before: always; }
table { width: 100%; border-collapse: collapse; margin: 0 0 12pt; page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f2f2f2; }
tr.worse td { background: #fde2e1; color: #b3261e; font-weight: 600; border-top: 2px solid #b3261e; border-bottom: 2px solid #b3261e; }
.item { page-break-inside: avoid; break-inside: avoid; }
.pair { display: flex; gap: 8pt; margin: 0 0 8pt; page-break-inside: avoid; break-inside: avoid; }
.card { width: calc((100% - 8pt) / 2); border: 1px solid #ccc; padding: 4pt; font-size: 9pt; }
.card img { display: block; width: 100%; height: auto; }
.missing { display: flex; align-items: center; justify-content: center; height: 120pt; background: #f2f2f2; color: #666; }
.hash { font-family: Menlo, Consolas, monospace; }
footer { margin-top: 24pt; font-size: 8pt; color: #666; }
`;

type Side = 'move_in' | 'move_out';

const conditionText = (t: T, side: ReportItem | null, missing: Side) =>
  side ? conditionLabel(t, side.item.condition) : t(`cmp.notIn.${missing}`);

function change(t: T, i: ComparisonItem): string {
  if (!i.moveIn) return t('cmp.notIn.move_in');
  if (!i.moveOut) return t('cmp.notIn.move_out');
  const before = i.moveIn.item.condition;
  const after = i.moveOut.item.condition;
  if (before == null || after == null) return t('condition.notRecorded');
  if (i.worsened) return t('cmp.worse');
  return t(before === after ? 'cmp.same' : 'cmp.better');
}

/** The split's deductions on worsened items only, in comparison order, with each item's name. Shared with the dispute letter. */
export const worsenedDeductions = (c: Comparison, split: DepositSplit) =>
  c.rooms.flatMap((r) =>
    r.items.flatMap((i) => {
      const d = i.worsened && i.moveOut ? split.deductions[i.moveOut.item.id] : undefined;
      return d && d.cents > 0 ? [{ name: i.name, ...d }] : [];
    }),
  );

/** Per-tenant deposit summary from the move-out's split, counting deductions on worsened items only. '' without a deposit. */
function depositSplitSection(t: T, c: Comparison, locale: string): string {
  const split = parseDepositSplit(c.moveOut.deposit_split);
  const lines = worsenedDeductions(c, split);
  let refunds;
  try {
    refunds = settleDeposit(split, lines);
  } catch {
    return ''; // stored split no longer valid (e.g. percentages): drop the summary, never the whole comparison
  }
  if (!refunds || split.depositCents == null) return '';
  const money = (cents: number) => formatMoney(cents, locale);
  const who = (to: number | null) => escapeHtml(split.tenants.find((x) => x.id === to)?.name ?? t('split.everyone'));
  const deductions = lines.length
    ? `<table><thead><tr><th>${t('common.item')}</th><th>${t('split.deduction')}</th><th>${t('split.chargedTo')}</th></tr></thead><tbody>
${lines.map((l) => `<tr><td>${escapeHtml(l.name)}</td><td>${money(l.cents)}</td><td>${who(l.to)}</td></tr>`).join('\n')}
</tbody></table>`
    : '';
  return `
<section class="split">
<h2>${t('split.title')}</h2>
<p>${t('split.deposit')}: ${money(split.depositCents)}</p>
${deductions}
<table><thead><tr><th>${t('split.tenant')}</th><th>${t('split.share')}</th><th>${t('split.deductions')}</th><th>${t('split.refund')}</th></tr></thead><tbody>
${refunds.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${money(r.shareCents)}</td><td>${money(r.deductionCents)}</td><td>${money(r.refundCents)}</td></tr>`).join('\n')}
</tbody></table>
<p>${t('split.note')}</p>
</section>`;
}

/** Pure: comparison in, a complete print-ready HTML document out. Every user string goes through escapeHtml. */
export function buildComparisonHtml(c: Comparison, opts?: { formatDate?: (ms: number) => string; lang?: Lang }): string {
  const lang = opts?.lang ?? 'en';
  const t = translator(lang);
  const fmt = opts?.formatDate ?? ((ms: number) => defaultFormatDate(ms, lang));
  const row = (label: string, value: string) => `<dt>${label}</dt><dd>${value}</dd>`;
  const finished = (ms: number | null) => (ms != null ? fmt(ms) : t('pdf.notFinished'));
  const deposit = c.moveOut.state ? lookupDepositDeadline(c.moveOut.state) : undefined;
  const dueDate =
    deposit?.days != null && c.moveOut.move_out_date != null
      ? ` ${t('deposit.dueAround', { date: new Date(depositDueDate(c.moveOut.move_out_date, deposit.days)).toLocaleDateString(pdfLocale(lang), { year: 'numeric', month: 'short', day: 'numeric' }) })}.`
      : '';
  const depositNote = deposit
    ? `<p class="deposit">${escapeHtml(depositSummary(deposit))}${dueDate} ${t('deposit.source')}: <a href="${escapeHtml(deposit.source)}">${escapeHtml(deposit.source)}</a>. ${t('common.notLegalAdvice')}.</p>`
    : '';
  const hasPhotos = (side: 'moveIn' | 'moveOut') => c.rooms.some((r) => r.items.some((i) => i[side]?.photos.length));

  const cover = `<section class="cover">
<h1>${t('cmp.title')}</h1>
<dl>
${row(t('pdf.address'), escapeHtml(c.moveOut.address))}
${c.moveOut.unit ? row(t('pdf.unit'), escapeHtml(c.moveOut.unit)) : ''}
${row(t('cmp.moveInFinished'), finished(c.moveIn.finished_at))}
${row(t('cmp.moveOutFinished'), finished(c.moveOut.finished_at))}
${row(t('cmp.worsened'), String(c.worsenedCount))}
${row(t('pdf.generated'), fmt(c.generatedAt))}
${hasPhotos('moveIn') ? row(t('cmp.moveInVerification'), verificationText(c.moveInCode, t)) : ''}
${hasPhotos('moveOut') ? row(t('cmp.moveOutVerification'), verificationText(c.moveOutCode, t)) : ''}
</dl>
<p>${t('cmp.intro')}</p>
${depositNote}
</section>${depositSplitSection(t, c, pdfLocale(lang))}`;

  const card = (name: string, side: Side, photo: Photo | undefined) => {
    if (!photo) return `<div class="card"><div class="missing">${t(`cmp.noPhoto.${side}`)}</div></div>`;
    const src = c.thumbnails[photo.id];
    const caption = `${escapeHtml(name)} - ${t(`cmp.side.${side}`)}`;
    const image = src ? `<img src="${escapeHtml(src)}" alt="${caption}">` : `<div class="missing">${t('pdf.photoUnavailable')}</div>`;
    return `<div class="card">${image}<div>${caption}</div><div>${fmt(photo.captured_at)}</div><div>${receiptLine(c.receipts, photo.sha256, fmt, t)}</div><div class="hash">SHA-256: ${escapeHtml(photo.sha256.slice(0, 12))}</div></div>`;
  };

  const roomSections = c.rooms.map(({ name, items }) => {
    const tableRows = items
      .map(
        (i) =>
          `<tr${i.worsened ? ' class="worse"' : ''}><td>${escapeHtml(i.name)}</td><td>${conditionText(t, i.moveIn, 'move_in')}</td><td>${conditionText(t, i.moveOut, 'move_out')}</td><td>${change(t, i)}</td></tr>`,
      )
      .join('\n');
    const pairs = items
      .map((i) => {
        const before = i.moveIn?.photos ?? [];
        const after = i.moveOut?.photos ?? [];
        const n = Math.max(before.length, after.length);
        if (!n) return '';
        const rows = Array.from(
          { length: n },
          (_, k) => `<div class="pair">${card(i.name, 'move_in', before[k])}${card(i.name, 'move_out', after[k])}</div>`,
        );
        // The heading shares an unbreakable block with its first pair, so it is never left alone at a page bottom.
        // Only the first pair: a block of every pair could be taller than a page, and then no break rule holds.
        const [first, ...rest] = rows;
        return [`<div class="item"><h3>${escapeHtml(i.name)}${i.worsened ? ` (${t('cmp.worse')})` : ''}</h3>\n${first}</div>`, ...rest].join('\n');
      })
      .filter(Boolean);
    return `<section class="room">
<h2>${escapeHtml(name)}</h2>
<table><thead><tr><th>${t('common.item')}</th><th>${t('cmp.moveInCondition')}</th><th>${t('cmp.moveOutCondition')}</th><th>${t('cmp.change')}</th></tr></thead><tbody>
${tableRows}
</tbody></table>
${pairs.join('\n')}
</section>`;
  });

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${t('cmp.title')}</title>
<style>${STYLE}</style>
</head>
<body>
${cover}
${roomSections.join('\n')}
<footer><p>${t('common.notLegalAdvice')}.</p><p>${t('pdf.madeWith')}</p></footer>
</body>
</html>
`;
}
