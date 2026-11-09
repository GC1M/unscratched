import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import Home from '../app/index';
import { listInspections } from '@/db/repo';
import type { Inspection } from '@/db/types';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    Stack: { Screen: () => null },
    router: { push: jest.fn() },
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
jest.mock('@/db/client', () => ({ getDb: jest.fn().mockResolvedValue({}) }));
jest.mock('@/db/repo', () => ({ listInspections: jest.fn() }));

const base: Inspection = {
  id: 1,
  address: '1 Main St',
  unit: '2B',
  kind: 'move_in',
  started_at: new Date(2026, 0, 15).getTime(),
  finished_at: null,
  tenant_name: null,
  landlord_name: null,
  linked_move_in_id: null,
  move_out_date: null,
};

beforeEach(() => jest.clearAllMocks());

test('renders inspections from the data layer', async () => {
  jest.mocked(listInspections).mockResolvedValue([
    base,
    { ...base, id: 2, address: '9 Elm St', unit: null, kind: 'move_out', finished_at: 5 },
  ]);
  await render(<Home />);

  expect(await screen.findByText('1 Main St, 2B')).toBeOnTheScreen();
  expect(screen.getByText(`Move-in · ${new Date(base.started_at).toLocaleDateString()}`)).toBeOnTheScreen();
  expect(screen.getByText('9 Elm St')).toBeOnTheScreen();
  expect(screen.getAllByText('Finished')).toHaveLength(1);

  await fireEvent.press(screen.getByText('9 Elm St'));
  expect(router.push).toHaveBeenCalledWith('/inspection/2');
});

test('shows empty text and the new inspection button', async () => {
  jest.mocked(listInspections).mockResolvedValue([]);
  await render(<Home />);

  expect(await screen.findByText('No inspections yet.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'New move-in inspection' }));
  expect(router.push).toHaveBeenCalledWith('/inspection/new');
});
