import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { buildComparison } from './comparison';
import { buildComparisonHtml } from './buildComparisonHtml';
import { slug } from './export';
import { loadReportData } from './loadReport';

/** e.g. Unscratched-comparison-12-main-st-2026-01-20.pdf (local date of generation). */
export function comparisonFileName(address: string, at: number): string {
  const d = new Date(at);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `Unscratched-comparison-${slug(address, 'report')}-${date}.pdf`;
}

/** Builds the move-in vs move-out comparison PDF for a move-out inspection and opens the share sheet. Returns the PDF uri. */
export async function exportComparison(db: SQLiteDatabase, moveOutId: number): Promise<string> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const moveOut = await loadReportData(db, moveOutId, null);
  const moveInId = moveOut.inspection.linked_move_in_id;
  if (moveInId == null) throw new Error('This inspection is not linked to a move-in.');
  const comparison = buildComparison(await loadReportData(db, moveInId, null), moveOut);
  const { uri } = await Print.printToFileAsync({ html: buildComparisonHtml(comparison) });
  const pdf = new File(Paths.cache, comparisonFileName(moveOut.inspection.address, comparison.generatedAt));
  await new File(uri).move(pdf, { overwrite: true });
  await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share comparison report' });
  return pdf.uri;
}
