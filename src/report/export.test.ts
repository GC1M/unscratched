import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { recordSent } from '@/db/repo';
import { syncReceipts } from '@/receipts/queue';

import { buildReportHtml } from './buildReportHtml';
import { exportReport, reportFileName, sendReport } from './export';
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
jest.mock('expo-mail-composer', () => ({
  isAvailableAsync: jest.fn(),
  composeAsync: jest.fn(),
  MailComposerStatus: { UNDETERMINED: 'undetermined', SENT: 'sent', SAVED: 'saved', CANCELLED: 'cancelled' },
}));
jest.mock('@/db/repo', () => ({ recordSent: jest.fn(async () => {}) }));
jest.mock('./loadReport', () => ({ loadReportData: jest.fn() }));
jest.mock('@/receipts/queue', () => ({ syncReceipts: jest.fn(async () => {}) }));
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

test('syncs receipts before loading the report data', async () => {
  await exportReport(db, 7, ack);
  expect(syncReceipts).toHaveBeenCalledWith(db);
  expect(jest.mocked(syncReceipts).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(loadReportData).mock.invocationCallOrder[0],
  );
});

describe('sendReport', () => {
  const pdf = 'file:///cache/Unscratched-move-in-12-main-st-apt-3-2026-01-20.pdf';
  const withContact = (contact: object, verificationCode: string | null = 'abcdef012345') =>
    jest.mocked(loadReportData).mockResolvedValue({
      ...data,
      acknowledgement: ack,
      verificationCode,
      inspection: { ...data.inspection, unit: null, landlord_email: null, portal_url: null, ...contact },
    } as ReportData);

  beforeEach(() => {
    jest.mocked(MailComposer.isAvailableAsync).mockResolvedValue(true);
    jest.mocked(MailComposer.composeAsync).mockResolvedValue({ status: MailComposer.MailComposerStatus.SENT });
  });

  test('opens the mail composer with the pdf, prefilled landlord and verify link, and records email when sent', async () => {
    withContact({ landlord_email: 'lee@example.com' });
    await expect(sendReport(db, 7, ack)).resolves.toBe('email');
    expect(MailComposer.composeAsync).toHaveBeenCalledWith({
      recipients: ['lee@example.com'],
      subject: 'Move-in inspection report: 12 Main St, Apt #3',
      body: 'Hello,\n\nAttached is my move-in inspection report for 12 Main St, Apt #3.\n\nThe photo timestamps can be checked at https://unscratched.app/v/abcdef012345\n\nThank you,\nAna',
      attachments: [pdf],
    });
    expect(recordSent).toHaveBeenCalledWith(db, 7, 'email');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  test('omits the verify link without a verification code', async () => {
    withContact({}, null);
    await sendReport(db, 7, ack);
    const { body, recipients } = jest.mocked(MailComposer.composeAsync).mock.calls[0][0];
    expect(recipients).toEqual([]);
    expect(body).not.toContain('unscratched.app');
  });

  test.each([MailComposer.MailComposerStatus.SAVED, MailComposer.MailComposerStatus.CANCELLED])('records nothing when %s', async (status) => {
    withContact({ landlord_email: 'lee@example.com' });
    jest.mocked(MailComposer.composeAsync).mockResolvedValue({ status });
    await expect(sendReport(db, 7, ack)).resolves.toBeNull();
    expect(recordSent).not.toHaveBeenCalled();
  });

  test('falls back to the share sheet without a mail account and records share', async () => {
    withContact({ landlord_email: 'lee@example.com' });
    jest.mocked(MailComposer.isAvailableAsync).mockResolvedValue(false);
    await expect(sendReport(db, 7, ack)).resolves.toBe('share');
    expect(MailComposer.composeAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith(pdf, expect.objectContaining({ mimeType: 'application/pdf' }));
    expect(recordSent).toHaveBeenCalledWith(db, 7, 'share');
  });

  test('uses the share sheet when only a portal URL is saved', async () => {
    withContact({ portal_url: 'https://portal.example.com' });
    await expect(sendReport(db, 7, ack)).resolves.toBe('share');
    expect(MailComposer.composeAsync).not.toHaveBeenCalled();
  });

  test('throws and builds nothing when neither mail nor sharing is available', async () => {
    jest.mocked(MailComposer.isAvailableAsync).mockResolvedValue(false);
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
    await expect(sendReport(db, 7, ack)).rejects.toThrow('Sharing is not available on this device.');
    expect(Print.printToFileAsync).not.toHaveBeenCalled();
    expect(recordSent).not.toHaveBeenCalled();
  });
});
