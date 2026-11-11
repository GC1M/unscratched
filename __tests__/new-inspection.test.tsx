import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import NewInspection from '../app/inspection/new';
import { createInspectionFromTemplate, getSetting, setSetting } from '@/db/repo';
import { scheduleReminders } from '@/lib/scheduleReminders';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { replace: jest.fn() },
}));
jest.mock('@/db/client', () => ({ getDb: jest.fn().mockResolvedValue({ fake: true }) }));
jest.mock('@/db/repo', () => ({
  createInspectionFromTemplate: jest.fn(),
  getSetting: jest.fn().mockResolvedValue(null),
  setSetting: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/scheduleReminders', () => ({ scheduleReminders: jest.fn().mockResolvedValue(undefined) }));

beforeEach(() => jest.clearAllMocks());

test('shows an error and does not create when address is empty', async () => {
  await render(<NewInspection />);
  await fireEvent.changeText(screen.getByLabelText('Address'), '   ');
  await fireEvent.changeText(screen.getByLabelText('Unit'), '2B');
  await fireEvent.press(screen.getByRole('button', { name: 'Start inspection' }));

  expect(await screen.findByText('Address is required')).toBeOnTheScreen();
  expect(createInspectionFromTemplate).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});

test('valid submit creates with trimmed values and navigates to the inspection', async () => {
  jest.mocked(createInspectionFromTemplate).mockResolvedValue(42);
  await render(<NewInspection />);
  await fireEvent.changeText(screen.getByLabelText('Address'), '  1 Main St ');
  await fireEvent.changeText(screen.getByLabelText('Unit'), ' 2B');
  await fireEvent.changeText(screen.getByLabelText('Tenant name'), '  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Start inspection' }));

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/inspection/42'));
  expect(createInspectionFromTemplate).toHaveBeenCalledWith(
    { fake: true },
    { address: '1 Main St', unit: '2B', tenant_name: null, landlord_name: null, move_out_date: null },
    undefined,
    'US',
  );
  expect(screen.queryByText('Address is required')).toBeNull();
  expect(scheduleReminders).not.toHaveBeenCalled();
});

test('the address error clears once the user types an address', async () => {
  await render(<NewInspection />);
  await fireEvent.press(screen.getByRole('button', { name: 'Start inspection' }));
  expect(await screen.findByText('Address is required')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Address'), '1');
  expect(screen.queryByText('Address is required')).toBeNull();
});

test('a move-out date is saved and reminders are scheduled for it', async () => {
  jest.mocked(createInspectionFromTemplate).mockResolvedValue(7);
  await render(<NewInspection />);
  await fireEvent.changeText(screen.getByLabelText('Address'), '1 Main St');
  await fireEvent.changeText(screen.getByLabelText('Move-out date (YYYY-MM-DD)'), '2027-06-30');
  await fireEvent.press(screen.getByRole('button', { name: 'Start inspection' }));

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/inspection/7'));
  const date = new Date(2027, 5, 30).getTime();
  expect(jest.mocked(createInspectionFromTemplate).mock.calls[0][1]).toMatchObject({ move_out_date: date });
  expect(scheduleReminders).toHaveBeenCalledWith(7, date);
});

test('an invalid move-out date shows an error and does not create', async () => {
  await render(<NewInspection />);
  await fireEvent.changeText(screen.getByLabelText('Address'), '1 Main St');
  await fireEvent.changeText(screen.getByLabelText('Move-out date (YYYY-MM-DD)'), '2027-02-30');
  await fireEvent.press(screen.getByRole('button', { name: 'Start inspection' }));

  expect(await screen.findByText('Use a real date like 2026-08-31')).toBeOnTheScreen();
  expect(createInspectionFromTemplate).not.toHaveBeenCalled();
});

test('a scheduling failure still navigates to the saved inspection', async () => {
  jest.mocked(createInspectionFromTemplate).mockResolvedValue(8);
  jest.mocked(scheduleReminders).mockRejectedValueOnce(new Error('native'));
  await render(<NewInspection />);
  await fireEvent.changeText(screen.getByLabelText('Address'), '1 Main St');
  await fireEvent.changeText(screen.getByLabelText('Move-out date (YYYY-MM-DD)'), '2027-06-30');
  await fireEvent.press(screen.getByRole('button', { name: 'Start inspection' }));

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/inspection/8'));
});

test('room templates default to the last used region', async () => {
  jest.mocked(getSetting).mockResolvedValueOnce('UK');
  await render(<NewInspection />);
  await waitFor(() => expect(screen.getByLabelText('UK room templates')).toBeSelected());
  expect(screen.getByLabelText('US room templates')).not.toBeSelected();
  expect(getSetting).toHaveBeenCalledWith({ fake: true }, 'region');
});

test('picking a region creates from its templates and remembers it', async () => {
  jest.mocked(createInspectionFromTemplate).mockResolvedValue(9);
  await render(<NewInspection />);
  expect(screen.getByLabelText('US room templates')).toBeSelected();
  await fireEvent.press(screen.getByLabelText('Canada room templates'));
  expect(screen.getByLabelText('Canada room templates')).toBeSelected();
  await fireEvent.changeText(screen.getByLabelText('Address'), '1 Main St');
  await fireEvent.press(screen.getByRole('button', { name: 'Start inspection' }));

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/inspection/9'));
  expect(jest.mocked(createInspectionFromTemplate).mock.calls[0][3]).toBe('CA');
  expect(setSetting).toHaveBeenCalledWith({ fake: true }, 'region', 'CA');
});
