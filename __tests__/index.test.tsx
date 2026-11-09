import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import Home from '../app/index';
import { listInspectionItems, listInspections, listRooms } from '@/db/repo';
import type { Inspection } from '@/db/types';
import { shortDate } from '@/lib/format';

jest.mock('expo-router', () => jest.requireActual('@/test/expoRouter').mockExpoRouter());
jest.mock('@/db/client', () => ({ getDb: jest.fn().mockResolvedValue({}) }));
jest.mock('@/db/repo', () => ({ listInspections: jest.fn(), listRooms: jest.fn(), listInspectionItems: jest.fn() }));

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

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listRooms).mockResolvedValue([
    { id: 10, inspection_id: 1, name: 'Kitchen', sort: 0 },
    { id: 11, inspection_id: 1, name: 'Bath', sort: 1 },
  ]);
  jest.mocked(listInspectionItems).mockResolvedValue([
    { id: 1, room_id: 10, name: 'Walls', condition: 'good', note: null, sort: 0 },
    { id: 2, room_id: 11, name: 'Tub', condition: null, note: null, sort: 0 },
  ]);
});

test('the unfinished inspection is the hero with item progress; finished ones list below', async () => {
  jest.mocked(listInspections).mockResolvedValue([
    base,
    { ...base, id: 2, address: '9 Elm St', unit: null, kind: 'move_out', finished_at: new Date(2026, 1, 1).getTime() },
  ]);
  await render(<Home />);

  expect(await screen.findByText('1 Main St, 2B')).toBeOnTheScreen();
  expect(screen.getByText(`Move-in, started ${shortDate(base.started_at)}`)).toBeOnTheScreen();
  expect(screen.getByText('1 of 2 items, 1 of 2 rooms')).toBeOnTheScreen();
  expect(screen.getByText('9 Elm St')).toBeOnTheScreen();
  expect(screen.getByText('Report ready')).toBeOnTheScreen();
  expect(listRooms).toHaveBeenCalledTimes(1);
  expect(listRooms).toHaveBeenCalledWith({}, 1);

  await fireEvent.press(screen.getByText('9 Elm St'));
  expect(router.push).toHaveBeenCalledWith('/inspection/2');

  await fireEvent.press(screen.getByRole('button', { name: 'Continue inspection, 1 Main St, 2B' }));
  expect(router.push).toHaveBeenCalledWith('/inspection/1');
  expect(screen.getByText('Bath next')).toBeOnTheScreen();
});

test('shows the empty state and the new inspection button', async () => {
  jest.mocked(listInspections).mockResolvedValue([]);
  await render(<Home />);

  expect(await screen.findByText('No inspections yet')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'New move-in inspection' }));
  expect(router.push).toHaveBeenCalledWith('/inspection/new');
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  expect(router.push).toHaveBeenCalledWith('/settings');
});
