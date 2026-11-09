import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { buildReportHtml } from './buildReportHtml';
import { loadReportData } from './loadReport';
import type { Acknowledgement } from './types';

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

/** Builds the report PDF, renames it, and opens the share sheet. Returns the PDF uri. */
export async function exportReport(db: SQLiteDatabase, inspectionId: number, ack: Acknowledgement | null): Promise<string> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const data = await loadReportData(db, inspectionId, ack);
  const { uri } = await Print.printToFileAsync({ html: buildReportHtml(data) });
  const pdf = new File(Paths.cache, reportFileName(data.inspection.kind, data.inspection.address, data.generatedAt));
  await new File(uri).move(pdf, { overwrite: true });
  await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share inspection report' });
  return pdf.uri;
}
