import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { syncReceipts } from '@/receipts/queue';

import { buildComparisonHtml } from './buildComparisonHtml';
import { buildComparison } from './comparison';
import { buildDisputeLetterHtml } from './buildDisputeLetterHtml';
import { comparisonFileName, exportComparison, exportDisputeLetter } from './exportComparison';
import { loadReportData } from './loadReport';
import type { ReportData } from './types';

const mockMoves: [string, string, unknown][] = [];

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    async move(dest: { uri: string }, opts: unknown) {
      mockMoves.push([this.uri, dest.uri, opts]);
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache' } } };
});
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('./loadReport', () => ({ loadReportData: jest.fn() }));
jest.mock('@/receipts/queue', () => ({ syncReceipts: jest.fn(async () => {}) }));
jest.mock('./comparison', () => ({ buildComparison: jest.fn() }));
jest.mock('./buildComparisonHtml', () => ({ buildComparisonHtml: jest.fn() }));
jest.mock('./buildDisputeLetterHtml', () => ({ buildDisputeLetterHtml: jest.fn() }));

const db = {} as never;
const at = new Date(2026, 0, 20, 15).getTime();
const moveIn = { inspection: { id: 3, kind: 'move_in', address: '12 Main St' } } as unknown as ReportData;
const moveOut = {
  inspection: { id: 7, kind: 'move_out', address: '12 Main St, Apt #3', linked_move_in_id: 3 },
} as unknown as ReportData;
const comparison = { generatedAt: at } as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockMoves.length = 0;
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(loadReportData).mockImplementation(async (_db, id) => (id === 7 ? moveOut : moveIn));
  jest.mocked(buildComparison).mockReturnValue(comparison);
  jest.mocked(buildComparisonHtml).mockReturnValue('<html>cmp</html>');
  jest.mocked(buildDisputeLetterHtml).mockReturnValue('<html>letter</html>');
  jest.mocked(Print.printToFileAsync).mockResolvedValue({ uri: 'file:///cache/Print/abc.pdf', numberOfPages: 1 });
});

test('loads both inspections without an acknowledgement, prints, renames, and shares the pdf', async () => {
  const pdf = 'file:///cache/Unscratched-comparison-12-main-st-apt-3-2026-01-20.pdf';
  await expect(exportComparison(db, 7)).resolves.toBe(pdf);
  expect(loadReportData).toHaveBeenCalledWith(db, 7, null);
  expect(loadReportData).toHaveBeenCalledWith(db, 3, null);
  expect(buildComparison).toHaveBeenCalledWith(moveIn, moveOut);
  expect(buildComparisonHtml).toHaveBeenCalledWith(comparison, { lang: 'en' });
  expect(Print.printToFileAsync).toHaveBeenCalledWith({ html: '<html>cmp</html>' });
  expect(mockMoves).toEqual([['file:///cache/Print/abc.pdf', pdf, { overwrite: true }]]);
  expect(Sharing.shareAsync).toHaveBeenCalledWith(pdf, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share comparison report',
  });
});

test('throws and prints nothing when sharing is unavailable', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  await expect(exportComparison(db, 7)).rejects.toThrow('Sharing is not available on this device.');
  expect(Print.printToFileAsync).not.toHaveBeenCalled();
});

test('throws when the move-out is not linked to a move-in', async () => {
  jest.mocked(loadReportData).mockResolvedValue({ inspection: { linked_move_in_id: null } } as never);
  await expect(exportComparison(db, 7)).rejects.toThrow('not linked to a move-in');
  expect(Print.printToFileAsync).not.toHaveBeenCalled();
});

test('file name is Unscratched-comparison-<slug>-<yyyy-mm-dd>.pdf', () => {
  expect(comparisonFileName('12 Main St', new Date(2026, 10, 9).getTime())).toBe('Unscratched-comparison-12-main-st-2026-11-09.pdf');
  expect(comparisonFileName('***', new Date(2026, 10, 9).getTime())).toBe('Unscratched-comparison-report-2026-11-09.pdf');
});

test('syncs receipts before loading the report data', async () => {
  await exportComparison(db, 7);
  expect(syncReceipts).toHaveBeenCalledWith(db);
  expect(jest.mocked(syncReceipts).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(loadReportData).mock.invocationCallOrder[0],
  );
});

test('dispute letter: builds the comparison, prints the letter, and shares it under its own name', async () => {
  const pdf = 'file:///cache/Unscratched-dispute-letter-12-main-st-apt-3-2026-01-20.pdf';
  await expect(exportDisputeLetter(db, 7)).resolves.toBe(pdf);
  expect(syncReceipts).toHaveBeenCalledWith(db);
  expect(buildComparison).toHaveBeenCalledWith(moveIn, moveOut);
  expect(buildDisputeLetterHtml).toHaveBeenCalledWith(comparison, { lang: 'en' });
  expect(buildComparisonHtml).not.toHaveBeenCalled();
  expect(Print.printToFileAsync).toHaveBeenCalledWith({ html: '<html>letter</html>' });
  expect(mockMoves).toEqual([['file:///cache/Print/abc.pdf', pdf, { overwrite: true }]]);
  expect(Sharing.shareAsync).toHaveBeenCalledWith(pdf, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share dispute letter',
  });
});

test('dispute letter throws when sharing is unavailable or the move-out is not linked', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
  await expect(exportDisputeLetter(db, 7)).rejects.toThrow('Sharing is not available on this device.');
  jest.mocked(loadReportData).mockResolvedValue({ inspection: { linked_move_in_id: null } } as never);
  await expect(exportDisputeLetter(db, 7)).rejects.toThrow('not linked to a move-in');
  expect(Print.printToFileAsync).not.toHaveBeenCalled();
});
