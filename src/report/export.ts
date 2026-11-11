import { File, Paths } from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { recordSent } from '@/db/repo';
import type { SentChannel } from '@/db/types';
import { translator, type Lang } from '@/i18n';
import { syncReceipts } from '@/receipts/queue';

import { buildReportHtml } from './buildReportHtml';
import { loadReportData } from './loadReport';
import type { Acknowledgement, ReportData } from './types';

/** Lowercase a-z0-9 words joined by '-', at most 40 chars: safe as a file or folder name. */
export function slug(text: string, fallback: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallback;
}

/** e.g. Unscratched-move-in-12-main-st-2026-01-20.pdf (local date of generation). */
export function reportFileName(kind: 'move_in' | 'move_out', address: string, at: number): string {
  const d = new Date(at);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `Unscratched-${kind.replace('_', '-')}-${slug(address, 'report')}-${date}.pdf`;
}

/** Builds the report PDF and renames it. Returns its uri and the data it was built from. */
async function buildPdf(db: SQLiteDatabase, inspectionId: number, ack: Acknowledgement | null, lang: Lang): Promise<{ uri: string; data: ReportData }> {
  await syncReceipts(db); // best effort, so the PDF has the latest receipts
  const data = await loadReportData(db, inspectionId, ack);
  const { uri } = await Print.printToFileAsync({ html: buildReportHtml(data, { lang }) });
  const pdf = new File(Paths.cache, reportFileName(data.inspection.kind, data.inspection.address, data.generatedAt));
  await new File(uri).move(pdf, { overwrite: true });
  return { uri: pdf.uri, data };
}

const sharePdf = (uri: string, lang: Lang) =>
  Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: translator(lang)('share.report') });

/** Builds the report PDF in lang, renames it, and opens the share sheet. Returns the PDF uri. */
export async function exportReport(db: SQLiteDatabase, inspectionId: number, ack: Acknowledgement | null, lang: Lang = 'en'): Promise<string> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const { uri } = await buildPdf(db, inspectionId, ack, lang);
  await sharePdf(uri, lang);
  return uri;
}

/** Subject and plain-text body for the landlord email. The verify link is included only once the report has a code. */
export function landlordMessage({ inspection, acknowledgement, verificationCode }: ReportData, lang: Lang = 'en'): { subject: string; body: string } {
  const t = translator(lang);
  const place = inspection.unit ? `${inspection.address}, ${inspection.unit}` : inspection.address;
  const lines = [t('email.hello'), '', t('email.attached', { kind: t(`kind.${inspection.kind}`).toLowerCase(), place })];
  if (verificationCode) lines.push('', t('email.verify', { link: `https://unscratched.app/v/${verificationCode}` }));
  lines.push('', t('email.thanks'), acknowledgement?.tenantName ?? '');
  return { subject: `${t(`pdf.title.${inspection.kind}`)}: ${place}`, body: lines.join('\n').trimEnd() };
}

/**
 * Sends the report PDF to the landlord through the user's own mail app (landlord email prefilled), or through the
 * share sheet when no mail account is set up or only a portal URL is saved. Records the delivery and returns its
 * channel: 'email' only when the composer reports sent (saved or cancelled records nothing and returns null), and
 * 'share' once the share sheet closes, since iOS does not say where the file went.
 * The PDF is built before the record is written, so the record shows up in later exports, not this one.
 */
export async function sendReport(db: SQLiteDatabase, inspectionId: number, ack: Acknowledgement | null, lang: Lang = 'en'): Promise<SentChannel | null> {
  const mail = await MailComposer.isAvailableAsync();
  if (!mail && !(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const { uri, data } = await buildPdf(db, inspectionId, ack, lang);
  const { landlord_email, portal_url } = data.inspection;
  if (mail && (landlord_email || !portal_url)) {
    const { status } = await MailComposer.composeAsync({
      recipients: landlord_email ? [landlord_email] : [],
      ...landlordMessage(data, lang),
      attachments: [uri],
    });
    if (status !== MailComposer.MailComposerStatus.SENT) return null;
    await recordSent(db, inspectionId, 'email');
    return 'email';
  }
  await sharePdf(uri, lang);
  await recordSent(db, inspectionId, 'share');
  return 'share';
}
