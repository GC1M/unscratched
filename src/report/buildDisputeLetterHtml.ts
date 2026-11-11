import { depositDueDate, depositSummary, lookupDepositDeadline } from '@/legal/depositDeadlines';

import { CONDITION_LABELS } from './buildReportHtml';
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

const defaultFormatDay = (ms: number) => new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/** Something the app does not know: shown in brackets and highlighted for the tenant to fill in. */
const blank = (label: string) => `<span class="placeholder">[${label}]</span>`;
const orBlank = (text: string | null | undefined, label: string) => (text?.trim() ? escapeHtml(text.trim()) : blank(label));

/** Pure: comparison in, a print-ready deposit-return letter out. Every user string goes through escapeHtml. */
export function buildDisputeLetterHtml(c: Comparison, opts?: { formatDate?: (ms: number) => string }): string {
  const fmt = opts?.formatDate ?? defaultFormatDay;
  const { moveIn, moveOut } = c;
  const tenant = orBlank(moveOut.tenant_name ?? moveIn.tenant_name, 'Your name');
  const landlord = orBlank(moveOut.landlord_name ?? moveIn.landlord_name, 'Landlord or manager name');
  const property = escapeHtml(moveOut.address) + (moveOut.unit ? `, Unit ${escapeHtml(moveOut.unit)}` : '');
  const day = (ms: number | null, label: string) => (ms != null ? fmt(ms) : blank(label));
  const moveOutDay = day(moveOut.move_out_date ?? moveOut.finished_at, 'Move-out date');

  // Rows with days: null (KY, TN) still get the summary, which says there is no simple deadline; no due date then.
  const deposit = moveOut.state ? lookupDepositDeadline(moveOut.state) : undefined;
  const due = deposit?.days != null && moveOut.move_out_date != null ? ` By that rule the deposit is due around ${fmt(depositDueDate(moveOut.move_out_date, deposit.days))}.` : '';
  const depositNote = deposit ? `\n<p>${escapeHtml(depositSummary(deposit))}${due} Source: ${escapeHtml(deposit.source)}.</p>` : '';

  const flagged = c.rooms.flatMap((r) => r.items.filter((i) => i.worsened).map((i) => ({ room: r.name, ...i })));
  // Same or better: both sides recorded and not worse. Items missing on a side or without a condition are left out.
  const notWorse = c.rooms.reduce((n, r) => n + r.items.filter((i) => i.moveIn?.item.condition && i.moveOut?.item.condition && !i.worsened).length, 0);
  const condition = (side: (typeof flagged)[number]['moveIn']) => (side?.item.condition ? CONDITION_LABELS[side.item.condition] : 'Not recorded');

  const flaggedSection = flagged.length
    ? `<p>The comparison marks ${flagged.length === 1 ? 'one item' : `${flagged.length} items`} as being in worse condition at move-out than at move-in. I list ${flagged.length === 1 ? 'it' : 'them'} here so we can discuss ${flagged.length === 1 ? 'it' : 'them'} openly, and I ask that any deduction for ${flagged.length === 1 ? 'it' : 'them'} be itemized with receipts or estimates and reflect only damage beyond normal wear and tear:</p>
<table><thead><tr><th>Room</th><th>Item</th><th>Move-in</th><th>Move-out</th><th>Note</th></tr></thead><tbody>
${flagged
  .map((i) => `<tr><td>${escapeHtml(i.room)}</td><td>${escapeHtml(i.name)}</td><td>${condition(i.moveIn)}</td><td>${condition(i.moveOut)}</td><td>${escapeHtml(i.moveOut?.item.note ?? '')}</td></tr>`)
  .join('\n')}
</tbody></table>`
    : '<p>The comparison shows no item in worse condition at move-out than at move-in.</p>';

  const evidence = c.moveOutCode
    ? `The attached move-in vs move-out comparison report has dated photos of the unit with server timestamps. It can be checked with verification code ${escapeHtml(c.moveOutCode)} at unscratched.app/v/${escapeHtml(c.moveOutCode)}.`
    : 'The attached move-in vs move-out comparison report has dated photos of the unit.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Security deposit return request</title>
<style>${STYLE}</style>
</head>
<body>
<p class="disclaimer"><strong>Not legal advice.</strong> This is a template prefilled from your inspection. Check your state or local law and edit anything in brackets before sending.</p>
<p>${fmt(c.generatedAt)}</p>
<p>${landlord}<br>${blank('Landlord mailing address')}</p>
<p><strong>Re: Return of security deposit for ${property}</strong></p>
<p>Dear ${landlord},</p>
<p>I rented ${property} and moved in on ${day(moveIn.finished_at, 'Move-in date')}. I moved out on ${moveOutDay}. I am writing to ask that my security deposit of ${blank('Deposit amount')} be returned in full, or that you send an itemized list of any deductions.</p>${depositNote}
<p>I documented the unit's condition at move-in and at move-out. ${notWorse === 1 ? 'One item was' : `${notWorse} items were`} recorded in the same or better condition at move-out.</p>
${flaggedSection}
<p>${evidence}</p>
<p>Please send the deposit to ${blank('Forwarding address')}. Thank you for your help.</p>
<p>Sincerely,<br>${tenant}</p>
</body>
</html>
`;
}
