import type { Condition } from '@/db/types';
import { translator, type Lang, type T } from '@/i18n';

import { escapeHtml } from './escapeHtml';
import { signatureSvg } from './signature';
import type { ReportData } from './types';

/** "Good", "Fair", "Damaged", or "Not recorded" in the report's language. */
export const conditionLabel = (t: T, condition: Condition | null) => t(condition ? `condition.${condition}` : 'condition.notRecorded');

const BLANK = '<span class="blank"></span>';

// Photo cards are inline blocks, not flex items: WebKit print ignores break-inside on flex items and split a card
// across pages. The grid's font-size: 0 drops the whitespace between cards.
const STYLE = `
@page { margin: 16mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.4; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-size: 22pt; margin: 0 0 12pt; }
h2 { font-size: 16pt; margin: 0 0 8pt; }
.cover dl { display: grid; grid-template-columns: max-content 1fr; gap: 4pt 12pt; margin: 0 0 16pt; }
.cover dt { font-weight: 600; }
.cover dd { margin: 0; }
.room { page-break-before: always; }
table { width: 100%; border-collapse: collapse; margin: 0 0 12pt; page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f2f2f2; }
.grid { font-size: 0; }
.card { display: inline-block; vertical-align: top; width: calc((100% - 16pt) / 3); margin: 0 8pt 8pt 0; border: 1px solid #ccc; padding: 4pt; font-size: 9pt; page-break-inside: avoid; break-inside: avoid; }
.card:nth-child(3n) { margin-right: 0; }
.card img { display: block; width: 100%; height: auto; }
.missing { display: flex; align-items: center; justify-content: center; height: 120pt; background: #f2f2f2; color: #666; }
.hash { font-family: Menlo, Consolas, monospace; }
.ack { page-break-inside: avoid; margin-top: 24pt; }
.sig { display: block; width: 180pt; height: 60pt; }
.blank { display: inline-block; width: 200pt; border-bottom: 1px solid #111; }
footer { margin-top: 24pt; font-size: 8pt; color: #666; }
`;

/** Server time from the receipt, or "Receipt pending" until the hash has one. */
export const receiptLine = (receipts: Record<string, number>, sha256: string, fmt: (ms: number) => string, t: T = translator('en')) =>
  sha256 in receipts ? t('pdf.serverTime', { time: fmt(receipts[sha256]) }) : t('pdf.receiptPending');

/** Cover row value: the code and its verify URL, or "Verification pending". Codes are hex, so no escaping needed. */
export const verificationText = (code: string | null, t: T = translator('en')) =>
  code ? `${t('pdf.verificationCode', { code })}<br>unscratched.app/v/${code}` : t('pdf.verificationPending');

/** Locale for dates in a PDF: English keeps the US format the reports always had. */
export const pdfLocale = (lang: Lang) => (lang === 'en' ? 'en-US' : lang);

export const defaultFormatDate = (ms: number, lang: Lang = 'en') =>
  new Date(ms).toLocaleString(pdfLocale(lang), { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Pure: report data in, a complete print-ready HTML document out. Every user string goes through escapeHtml. */
export function buildReportHtml(data: ReportData, opts?: { formatDate?: (ms: number) => string; lang?: Lang }): string {
  const lang = opts?.lang ?? 'en';
  const t = translator(lang);
  const fmt = opts?.formatDate ?? ((ms: number) => defaultFormatDate(ms, lang));
  const { inspection, rooms, thumbnails, acknowledgement, generatedAt, receipts, verificationCode } = data;
  const hasPhotos = rooms.some((r) => r.items.some((i) => i.photos.length));
  const title = t(`pdf.title.${inspection.kind}`);
  const row = (label: string, value: string) => `<dt>${label}</dt><dd>${value}</dd>`;

  const cover = `<section class="cover">
<h1>${title}</h1>
<dl>
${row(t('pdf.address'), escapeHtml(inspection.address))}
${inspection.unit ? row(t('pdf.unit'), escapeHtml(inspection.unit)) : ''}
${row(t('pdf.started'), fmt(inspection.started_at))}
${row(t('pdf.finished'), inspection.finished_at != null ? fmt(inspection.finished_at) : t('pdf.notFinished'))}
${inspection.tenant_name ? row(t('pdf.tenant'), escapeHtml(inspection.tenant_name)) : ''}
${inspection.landlord_name ? row(t('common.landlordOrManager'), escapeHtml(inspection.landlord_name)) : ''}
${inspection.sent_at != null && inspection.sent_channel ? row(t('pdf.sent'), t('pdf.sentBy', { date: fmt(inspection.sent_at), channel: escapeHtml(t(`channel.${inspection.sent_channel}`)) })) : ''}
${row(t('pdf.generated'), fmt(generatedAt))}
${hasPhotos ? row(t('pdf.verification'), verificationText(verificationCode, t)) : ''}
</dl>
<p>${t('pdf.photosIntro')}</p>
</section>`;

  const roomSections = rooms.map(({ room, items }) => {
    const tableRows = items
      .map(({ item }) => {
        const condition = conditionLabel(t, item.condition);
        const note = item.note ? escapeHtml(item.note).replace(/\r?\n/g, '<br>') : '';
        return `<tr><td>${escapeHtml(item.name)}</td><td>${condition}</td><td>${note}</td></tr>`;
      })
      .join('\n');
    const cards = items.flatMap(({ item, photos }) =>
      photos.map((photo, i) => {
        const src = thumbnails[photo.id];
        const caption = t('pdf.photoCaption', { name: escapeHtml(item.name), n: i + 1 });
        const image = src
          ? `<img src="${escapeHtml(src)}" alt="${caption}">`
          : `<div class="missing">${t('pdf.photoUnavailable')}</div>`;
        return `<div class="card">${image}<div>${caption}</div><div>${fmt(photo.captured_at)}</div><div>${receiptLine(receipts, photo.sha256, fmt, t)}</div><div class="hash">SHA-256: ${escapeHtml(photo.sha256.slice(0, 12))}</div></div>`;
      }),
    );
    return `<section class="room">
<h2>${escapeHtml(room.name)}</h2>
<table><thead><tr><th>${t('common.item')}</th><th>${t('common.condition')}</th><th>${t('common.note')}</th></tr></thead><tbody>
${tableRows}
</tbody></table>
${cards.length ? `<div class="grid">\n${cards.join('\n')}\n</div>` : ''}
</section>`;
  });

  const tenant = acknowledgement?.tenantName ? escapeHtml(acknowledgement.tenantName) : BLANK;
  const signature = signatureSvg(acknowledgement?.tenantSignature) ?? '';
  const landlord = acknowledgement?.landlordName ? escapeHtml(acknowledgement.landlordName) : BLANK;
  const ack = `<section class="ack">
<p>${t('pdf.confirm', { date: fmt(inspection.finished_at ?? generatedAt) })}</p>
<p>${t('pdf.tenant')}: ${tenant}${signature}</p>
<p>${t('common.landlordOrManager')}: ${landlord}</p>
</section>`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
${cover}
${roomSections.join('\n')}
${ack}
<footer><p>${t('common.notLegalAdvice')}.</p><p>${t('pdf.madeWith')}</p></footer>
</body>
</html>
`;
}
