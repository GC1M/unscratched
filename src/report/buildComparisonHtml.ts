import type { Photo } from '@/db/types';

import { CONDITION_LABELS, defaultFormatDate, receiptLine, verificationText } from './buildReportHtml';
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
.pair { display: flex; gap: 8pt; margin: 0 0 8pt; page-break-inside: avoid; break-inside: avoid; }
.card { width: calc((100% - 8pt) / 2); border: 1px solid #ccc; padding: 4pt; font-size: 9pt; }
.card img { display: block; width: 100%; height: auto; }
.missing { display: flex; align-items: center; justify-content: center; height: 120pt; background: #f2f2f2; color: #666; }
.hash { font-family: Menlo, Consolas, monospace; }
footer { margin-top: 24pt; font-size: 8pt; color: #666; }
`;

const conditionText = (side: ReportItem | null, missing: string) =>
  side ? (side.item.condition ? CONDITION_LABELS[side.item.condition] : 'Not recorded') : missing;

function change(i: ComparisonItem): string {
  if (!i.moveIn) return 'Not in move-in';
  if (!i.moveOut) return 'Not in move-out';
  const before = i.moveIn.item.condition;
  const after = i.moveOut.item.condition;
  if (before == null || after == null) return 'Not recorded';
  if (i.worsened) return 'Worse';
  return before === after ? 'Same' : 'Better';
}

/** Pure: comparison in, a complete print-ready HTML document out. Every user string goes through escapeHtml. */
export function buildComparisonHtml(c: Comparison, opts?: { formatDate?: (ms: number) => string }): string {
  const fmt = opts?.formatDate ?? defaultFormatDate;
  const row = (label: string, value: string) => `<dt>${label}</dt><dd>${value}</dd>`;
  const finished = (ms: number | null) => (ms != null ? fmt(ms) : 'Not finished');
  const hasPhotos = (side: 'moveIn' | 'moveOut') => c.rooms.some((r) => r.items.some((i) => i[side]?.photos.length));

  const cover = `<section class="cover">
<h1>Move-in vs move-out comparison</h1>
<dl>
${row('Address', escapeHtml(c.moveOut.address))}
${c.moveOut.unit ? row('Unit', escapeHtml(c.moveOut.unit)) : ''}
${row('Move-in finished', finished(c.moveIn.finished_at))}
${row('Move-out finished', finished(c.moveOut.finished_at))}
${row('Worsened items', String(c.worsenedCount))}
${row('Generated', fmt(c.generatedAt))}
${hasPhotos('moveIn') ? row('Move-in verification', verificationText(c.moveInCode)) : ''}
${hasPhotos('moveOut') ? row('Move-out verification', verificationText(c.moveOutCode)) : ''}
</dl>
<p>Rows marked "Worse" are items whose condition got worse between move-in and move-out. Photos were taken in the Unscratched app; each photo's SHA-256 fingerprint is listed so the files can be checked later.</p>
</section>`;

  const card = (name: string, label: string, photo: Photo | undefined) => {
    if (!photo) return `<div class="card"><div class="missing">No ${label} photo</div></div>`;
    const src = c.thumbnails[photo.id];
    const caption = `${escapeHtml(name)} - ${label}`;
    const image = src ? `<img src="${escapeHtml(src)}" alt="${caption}">` : '<div class="missing">Photo unavailable</div>';
    return `<div class="card">${image}<div>${caption}</div><div>${fmt(photo.captured_at)}</div><div>${receiptLine(c.receipts, photo.sha256, fmt)}</div><div class="hash">SHA-256: ${escapeHtml(photo.sha256.slice(0, 12))}</div></div>`;
  };

  const roomSections = c.rooms.map(({ name, items }) => {
    const tableRows = items
      .map(
        (i) =>
          `<tr${i.worsened ? ' class="worse"' : ''}><td>${escapeHtml(i.name)}</td><td>${conditionText(i.moveIn, 'Not in move-in')}</td><td>${conditionText(i.moveOut, 'Not in move-out')}</td><td>${change(i)}</td></tr>`,
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
          (_, k) => `<div class="pair">${card(i.name, 'move-in', before[k])}${card(i.name, 'move-out', after[k])}</div>`,
        );
        return `<h3>${escapeHtml(i.name)}${i.worsened ? ' (Worse)' : ''}</h3>\n${rows.join('\n')}`;
      })
      .filter(Boolean);
    return `<section class="room">
<h2>${escapeHtml(name)}</h2>
<table><thead><tr><th>Item</th><th>Move-in condition</th><th>Move-out condition</th><th>Change</th></tr></thead><tbody>
${tableRows}
</tbody></table>
${pairs.join('\n')}
</section>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Move-in vs move-out comparison</title>
<style>${STYLE}</style>
</head>
<body>
${cover}
${roomSections.join('\n')}
<footer><p>Not legal advice.</p><p>Made with Unscratched (free)</p></footer>
</body>
</html>
`;
}
