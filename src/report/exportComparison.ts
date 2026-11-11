import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { translator, type Lang } from '@/i18n';
import { syncReceipts } from '@/receipts/queue';

import { buildComparison } from './comparison';
import { buildComparisonHtml } from './buildComparisonHtml';
import { buildDisputeLetterHtml } from './buildDisputeLetterHtml';
import { slug } from './export';
import { loadReportData } from './loadReport';

/** e.g. Unscratched-comparison-12-main-st-2026-01-20.pdf (local date of generation). */
export function comparisonFileName(address: string, at: number, kind: 'comparison' | 'dispute-letter' = 'comparison'): string {
  const d = new Date(at);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `Unscratched-${kind}-${slug(address, 'report')}-${date}.pdf`;
}

async function sharePdf(db: SQLiteDatabase, moveOutId: number, kind: 'comparison' | 'dispute-letter', lang: Lang): Promise<string> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await syncReceipts(db); // best effort, so the PDF has the latest receipts
  const moveOut = await loadReportData(db, moveOutId, null);
  const moveInId = moveOut.inspection.linked_move_in_id;
  if (moveInId == null) throw new Error('This inspection is not linked to a move-in.');
  const comparison = buildComparison(await loadReportData(db, moveInId, null), moveOut);
  const html = kind === 'comparison' ? buildComparisonHtml(comparison, { lang }) : buildDisputeLetterHtml(comparison, { lang });
  const { uri } = await Print.printToFileAsync({ html });
  const pdf = new File(Paths.cache, comparisonFileName(moveOut.inspection.address, comparison.generatedAt, kind));
  await new File(uri).move(pdf, { overwrite: true });
  const dialogTitle = translator(lang)(kind === 'comparison' ? 'share.comparison' : 'share.letter');
  await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
  return pdf.uri;
}

/** Builds the move-in vs move-out comparison PDF for a move-out inspection and opens the share sheet. Returns the PDF uri. */
export const exportComparison = (db: SQLiteDatabase, moveOutId: number, lang: Lang = 'en') => sharePdf(db, moveOutId, 'comparison', lang);

/** Builds a deposit-return letter prefilled from the comparison and opens the share sheet. Returns the PDF uri. */
export const exportDisputeLetter = (db: SQLiteDatabase, moveOutId: number, lang: Lang = 'en') => sharePdf(db, moveOutId, 'dispute-letter', lang);
