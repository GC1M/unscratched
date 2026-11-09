import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { buildReportHtml } from './buildReportHtml';
import { exportReport, reportFileName } from './export';
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
jest.mock('./buildReportHtml', () => ({ buildReportHtml: jest.fn() }));

const db = {} as never;
const ack = { tenantName: 'Ana', landlordName: 'Bo', date: 1 };
const data = {
  inspection: { kind: 'move_in', address: '12 Main St, Apt #3' },
  generatedAt: new Date(2026, 0, 20, 15).getTime(),
} as unknown as ReportData;

beforeEach(() => {
  jest.clearAllMocks();
  mockMoves.length = 0;
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(loadReportData).mockResolvedValue(data);
  jest.mocked(buildReportHtml).mockReturnValue('<html>report</html>');
  jest.mocked(Print.printToFileAsync).mockResolvedValue({ uri: 'file:///cache/Print/abc.pdf', numberOfPages: 1 });
});

test('prints the report html, renames the pdf, then shares it as a pdf', async () => {
  const pdf = 'file:///cache/Unscratched-move-in-12-main-st-apt-3-2026-01-20.pdf';
  await expect(exportReport(db, 7, ack)).resolves.toBe(pdf);
  expect(loadReportData).toHaveBeenCalledWith(db, 7, ack);
  expect(buildReportHtml).toHaveBeenCalledWith(data);
  expect(Print.printToFileAsync).toHaveBeenCalledWith({ html: '<html>report</html>' });
  expect(mockMoves).toEqual([['file:///cache/Print/abc.pdf', pdf, { overwrite: true }]]);
  expect(Sharing.shareAsync).toHaveBeenCalledWith(pdf, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share inspection report',
  });
  expect(jest.mocked(Print.printToFileAsync).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(Sharing.shareAsync).mock.invocationCallOrder[0],
  );
});

test('throws a clear error and prints nothing when sharing is unavailable', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  await expect(exportReport(db, 7, ack)).rejects.toThrow('Sharing is not available on this device.');
  expect(Print.printToFileAsync).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('file name slug keeps only safe characters', () => {
  const at = new Date(2026, 10, 9).getTime();
  expect(reportFileName('move_out', '  ../Ünit 5/"x"  ', at)).toBe('Unscratched-move-out-nit-5-x-2026-11-09.pdf');
  expect(reportFileName('move_in', '***', at)).toBe('Unscratched-move-in-report-2026-11-09.pdf');
});
