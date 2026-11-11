import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Linking, type AlertButton } from 'react-native';

import * as repo from '@/db/repo';
import { exportReport, sendReport } from '@/report/export';
import { exportPhotosZip } from '@/report/exportPhotosZip';

import ExportReport from '../app/inspection/[id]/export';

jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));
jest.mock('@/db/repo');
jest.mock('@/report/export', () => ({ exportReport: jest.fn(), sendReport: jest.fn() }));
jest.mock('@/report/exportPhotosZip', () => ({ exportPhotosZip: jest.fn() }));
jest.mock('expo-router', () => jest.requireActual('@/test/expoRouter').mockExpoRouter({ useLocalSearchParams: () => ({ id: '1' }) }));

const finishedAt = new Date(2026, 0, 20).getTime();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(repo.getInspection).mockResolvedValue({
    id: 1, address: '1 Main St', finished_at: finishedAt, tenant_name: null, landlord_name: 'Lee',
  } as never);
});

test('Export PDF is disabled until the tenant name is filled, then exports with the typed names', async () => {
  await render(<ExportReport />);
  expect(
    await screen.findByText(
      `I confirm this report reflects the unit's condition on ${new Date(finishedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.`,
    ),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText('Landlord or manager typed name').props.value).toBe('Lee');
  const button = screen.getByRole('button', { name: 'Export PDF' });
  expect(button).toBeDisabled();
  await fireEvent.press(button);
  expect(exportReport).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Tenant typed name'), '  Ana Ruiz ');
  await fireEvent.changeText(screen.getByLabelText('Landlord or manager typed name'), ' ');
  expect(button).toBeEnabled();
  await fireEvent.press(button);
  expect(exportReport).toHaveBeenCalledWith({}, 1, { tenantName: 'Ana Ruiz', landlordName: null, date: finishedAt, tenantSignature: null });
  expect(repo.getInspection).toHaveBeenCalledTimes(1);
});

test('prefills names from the inspection and shows an alert when export fails', async () => {
  jest.mocked(repo.getInspection).mockResolvedValue({
    id: 1, address: '1 Main St', finished_at: finishedAt, tenant_name: 'Ana', landlord_name: 'Lee',
  } as never);
  jest.mocked(exportReport).mockRejectedValue(new Error('boom'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<ExportReport />);
  await screen.findByDisplayValue('Ana');
  await fireEvent.press(screen.getByRole('button', { name: 'Export PDF' }));
  expect(exportReport).toHaveBeenCalledWith({}, 1, { tenantName: 'Ana', landlordName: 'Lee', date: finishedAt, tenantSignature: null });
  expect(alert).toHaveBeenCalledWith('Export failed', 'boom');
});

test('the zip button shares photos without needing the tenant name, and alerts on failure', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<ExportReport />);
  await screen.findByDisplayValue('Lee');
  const zip = screen.getByRole('button', { name: 'Share full-resolution photos (.zip)' });
  expect(zip).toBeEnabled();
  await fireEvent.press(zip);
  expect(exportPhotosZip).toHaveBeenCalledWith({}, 1);
  expect(exportReport).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();

  jest.mocked(exportPhotosZip).mockRejectedValue(new Error('This inspection has no photos to export.'));
  await fireEvent.press(zip);
  expect(alert).toHaveBeenCalledWith('Photo export failed', 'This inspection has no photos to export.');
});

test('Send to landlord sends with the typed names; nothing more after an email', async () => {
  jest.mocked(sendReport).mockResolvedValue('email');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<ExportReport />);
  await screen.findByDisplayValue('Lee');
  const send = screen.getByRole('button', { name: 'Send to landlord' });
  expect(send).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Tenant typed name'), 'Ana');
  await fireEvent.press(send);
  expect(sendReport).toHaveBeenCalledWith({}, 1, { tenantName: 'Ana', landlordName: 'Lee', date: finishedAt, tenantSignature: null });
  expect(alert).not.toHaveBeenCalled();
});

test('after the share sheet, offers the saved portal and records portal once the user confirms', async () => {
  jest.mocked(repo.getInspection).mockResolvedValue({
    id: 1, address: '1 Main St', finished_at: finishedAt, tenant_name: 'Ana', landlord_name: null, portal_url: 'https://portal.example.com',
  } as never);
  jest.mocked(sendReport).mockResolvedValue('share');
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const press = async (label: string) => {
    const buttons = alert.mock.lastCall?.[2] as AlertButton[];
    await buttons.find((b) => b.text === label)?.onPress?.();
  };
  await render(<ExportReport />);
  await screen.findByDisplayValue('Ana');
  await fireEvent.press(screen.getByRole('button', { name: 'Send to landlord' }));
  expect(alert).toHaveBeenLastCalledWith('Open landlord portal?', 'Attach the PDF to a message or maintenance request.', expect.any(Array));
  await press('Open portal');
  expect(open).toHaveBeenCalledWith('https://portal.example.com');
  expect(alert).toHaveBeenLastCalledWith('Did you send it through the portal?', undefined, expect.any(Array));
  expect(repo.recordSent).not.toHaveBeenCalled();
  await press('Yes, I sent it');
  expect(repo.recordSent).toHaveBeenCalledWith({}, 1, 'portal');
});

test('an invalid saved portal URL is never offered', async () => {
  jest.mocked(repo.getInspection).mockResolvedValue({
    id: 1, address: '1 Main St', finished_at: finishedAt, tenant_name: 'Ana', landlord_name: null, portal_url: 'javascript:alert(1)',
  } as never);
  jest.mocked(sendReport).mockResolvedValue('share');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<ExportReport />);
  await screen.findByDisplayValue('Ana');
  await fireEvent.press(screen.getByRole('button', { name: 'Send to landlord' }));
  expect(sendReport).toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});

test.each([
  [{ id: 1, address: '1 Main St', finished_at: null, tenant_name: 'Ana', landlord_name: null }, 'Not finished yet'],
  [null, 'Inspection not found'],
])('refuses an unfinished or missing inspection with no export buttons', async (inspection, title) => {
  jest.mocked(repo.getInspection).mockResolvedValue(inspection as never);
  await render(<ExportReport />);
  expect(await screen.findByText(title)).toBeOnTheScreen();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByLabelText('Tenant typed name')).toBeNull();
});
