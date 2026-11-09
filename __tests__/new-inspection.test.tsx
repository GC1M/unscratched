import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import NewInspection from '../app/inspection/new';
import { createInspectionFromTemplate } from '@/db/repo';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { replace: jest.fn() },
}));
jest.mock('@/db/client', () => ({ getDb: jest.fn().mockResolvedValue({ fake: true }) }));
jest.mock('@/db/repo', () => ({ createInspectionFromTemplate: jest.fn() }));

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
    { address: '1 Main St', unit: '2B', tenant_name: null, landlord_name: null },
  );
  expect(screen.queryByText('Address is required')).toBeNull();
});
