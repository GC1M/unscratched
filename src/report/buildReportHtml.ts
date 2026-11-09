import type { Condition } from '@/db/types';

import { escapeHtml } from './escapeHtml';
import type { ReportData } from './types';

const CONDITION_LABELS: Record<Condition, string> = { good: 'Good', fair: 'Fair', damaged: 'Damaged' };

const BLANK = '<span class="blank"></span>';

const STYLE = `
@page { margin: 16mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.4; margin: 0; }
h1 { font-size: 22pt; margin: 0 0 12pt; }
h2 { font-size: 16pt; margin: 0 0 8pt; }
.cover dl { display: grid; grid-template-columns: max-content 1fr; gap: 4pt 12pt; margin: 0 0 16pt; }
.cover dt { font-weight: 600; }
.cover dd { margin: 0; }
.room { page-break-before: always; }
table { width: 100%; border-collapse: collapse; margin: 0 0 12pt; page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f2f2f2; }
.grid { display: flex; flex-wrap: wrap; gap: 8pt; }
.card { width: calc((100% - 16pt) / 3); border: 1px solid #ccc; padding: 4pt; font-size: 9pt; page-break-inside: avoid; break-inside: avoid; }
.card img { display: block; width: 100%; height: auto; }
.missing { display: flex; align-items: center; justify-content: center; height: 120pt; background: #f2f2f2; color: #666; }
.hash { font-family: Menlo, Consolas, monospace; }
.ack { page-break-inside: avoid; margin-top: 24pt; }
.blank { display: inline-block; width: 200pt; border-bottom: 1px solid #111; }
footer { margin-top: 24pt; font-size: 8pt; color: #666; }
`;

const defaultFormatDate = (ms: number) =>
  new Date(ms).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Pure: report data in, a complete print-ready HTML document out. Every user string goes through escapeHtml. */
export function buildReportHtml(data: ReportData, opts?: { formatDate?: (ms: number) => string }): string {
  const fmt = opts?.formatDate ?? defaultFormatDate;
  const { inspection, rooms, thumbnails, acknowledgement, generatedAt } = data;
  const title = inspection.kind === 'move_in' ? 'Move-in inspection report' : 'Move-out inspection report';
  const row = (label: string, value: string) => `<dt>${label}</dt><dd>${value}</dd>`;

  const cover = `<section class="cover">
<h1>${title}</h1>
<dl>
${row('Address', escapeHtml(inspection.address))}
${inspection.unit ? row('Unit', escapeHtml(inspection.unit)) : ''}
${row('Started', fmt(inspection.started_at))}
${row('Finished', inspection.finished_at != null ? fmt(inspection.finished_at) : 'Not finished')}
${inspection.tenant_name ? row('Tenant', escapeHtml(inspection.tenant_name)) : ''}
${inspection.landlord_name ? row('Landlord or manager', escapeHtml(inspection.landlord_name)) : ''}
${row('Generated', fmt(generatedAt))}
</dl>
<p>Photos were taken in the Unscratched app. Each photo's SHA-256 fingerprint is listed so the files can be checked later.</p>
</section>`;

  const roomSections = rooms.map(({ room, items }) => {
    const tableRows = items
      .map(({ item }) => {
        const condition = item.condition ? CONDITION_LABELS[item.condition] : 'Not recorded';
        const note = item.note ? escapeHtml(item.note).replace(/\r?\n/g, '<br>') : '';
        return `<tr><td>${escapeHtml(item.name)}</td><td>${condition}</td><td>${note}</td></tr>`;
      })
      .join('\n');
    const cards = items.flatMap(({ item, photos }) =>
      photos.map((photo, i) => {
        const src = thumbnails[photo.id];
        const caption = `${escapeHtml(item.name)} - photo ${i + 1}`;
        const image = src
          ? `<img src="${escapeHtml(src)}" alt="${caption}">`
          : '<div class="missing">Photo unavailable</div>';
        return `<div class="card">${image}<div>${caption}</div><div>${fmt(photo.captured_at)}</div><div class="hash">SHA-256: ${escapeHtml(photo.sha256.slice(0, 12))}</div></div>`;
      }),
    );
    return `<section class="room">
<h2>${escapeHtml(room.name)}</h2>
<table><thead><tr><th>Item</th><th>Condition</th><th>Note</th></tr></thead><tbody>
${tableRows}
</tbody></table>
${cards.length ? `<div class="grid">\n${cards.join('\n')}\n</div>` : ''}
</section>`;
  });

  const tenant = acknowledgement?.tenantName ? escapeHtml(acknowledgement.tenantName) : BLANK;
  const landlord = acknowledgement?.landlordName ? escapeHtml(acknowledgement.landlordName) : BLANK;
  const ack = `<section class="ack">
<p>I confirm this report reflects the unit's condition on ${fmt(inspection.finished_at ?? generatedAt)}.</p>
<p>Tenant: ${tenant}</p>
<p>Landlord or manager: ${landlord}</p>
</section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
${cover}
${roomSections.join('\n')}
${ack}
<footer><p>Not legal advice.</p><p>Made with Unscratched (free)</p></footer>
</body>
</html>
`;
}
