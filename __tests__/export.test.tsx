import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as repo from '@/db/repo';
import { exportReport } from '@/report/export';

import ExportReport from '../app/inspection/[id]/export';

jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));
jest.mock('@/db/repo');
jest.mock('@/report/export', () => ({ exportReport: jest.fn() }));
jest.mock('expo-router', () => require('@/test/expoRouter').mockExpoRouter({ useLocalSearchParams: () => ({ id: '1' }) }));

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
  expect(exportReport).toHaveBeenCalledWith({}, 1, { tenantName: 'Ana Ruiz', landlordName: null, date: finishedAt });
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
  expect(exportReport).toHaveBeenCalledWith({}, 1, { tenantName: 'Ana', landlordName: 'Lee', date: finishedAt });
  expect(alert).toHaveBeenCalledWith('Export failed', 'boom');
});
