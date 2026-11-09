import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as repo from '@/db/repo';
import type { Item, Room } from '@/db/types';
import { shortDate } from '@/lib/format';

import RoomList from '../app/inspection/[id]/index';

jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));
jest.mock('@/db/repo');
jest.mock('expo-router', () => require('@/test/expoRouter').mockExpoRouter({ useLocalSearchParams: () => ({ id: '1' }) }));

const r = jest.mocked(repo);
let rooms: Room[];
let items: Item[];

beforeEach(() => {
  jest.clearAllMocks();
  rooms = [
    { id: 10, inspection_id: 1, name: 'Kitchen', sort: 0 },
    { id: 11, inspection_id: 1, name: 'Bath', sort: 1 },
  ];
  items = [
    { id: 1, room_id: 10, name: 'Walls', condition: 'good', note: null, sort: 0 },
    { id: 2, room_id: 10, name: 'Floor', condition: null, note: null, sort: 1 },
  ];
  r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', kind: 'move_in', started_at: 0, finished_at: null } as never);
  r.listRooms.mockImplementation(async () => rooms);
  r.listInspectionItems.mockImplementation(async () => items);
});

test('lists rooms with item counts and overall item progress', async () => {
  await render(<RoomList />);
  expect(await screen.findByText('Kitchen')).toBeOnTheScreen();
  expect(screen.getByText('1 of 2')).toBeOnTheScreen();
  expect(screen.getByText('0 of 0')).toBeOnTheScreen();
  expect(screen.getByText('1 of 2 items, 0 of 2 rooms')).toBeOnTheScreen();
  expect(r.listInspectionItems).toHaveBeenCalledWith({}, 1);
  expect(r.listItems).not.toHaveBeenCalled();
});

test('Continue opens the first room with work left; Finish only shows once every room is done', async () => {
  const { router } = jest.requireMock('expo-router');
  await render(<RoomList />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue with Kitchen' }));
  expect(router.push).toHaveBeenCalledWith('/inspection/1/room/10');
  expect(screen.queryByRole('button', { name: 'Finish inspection' })).toBeNull();

  items = [
    { ...items[0] },
    { ...items[1], condition: 'fair' },
    { id: 3, room_id: 11, name: 'Tub', condition: 'damaged', note: null, sort: 0 },
  ];
  await render(<RoomList />);
  expect(await screen.findByRole('button', { name: 'Finish inspection' })).toBeOnTheScreen();
});

test('shows fair and damaged tallies per room', async () => {
  items = [
    { ...items[0], condition: 'fair' },
    { ...items[1], condition: 'damaged' },
    { id: 3, room_id: 11, name: 'Tub', condition: 'damaged', note: null, sort: 0 },
  ];
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  expect(screen.getAllByText('1')).toHaveLength(3);
});

test('adding a room shows it in the list', async () => {
  r.addRoom.mockImplementation(async (_db, _insp, name) => {
    rooms = [...rooms, { id: 12, inspection_id: 1, name, sort: 2 }];
    return 12;
  });
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  await fireEvent.press(screen.getByLabelText('Add room'));
  await fireEvent.changeText(screen.getByLabelText('New room name'), 'Hall');
  await fireEvent.press(screen.getByLabelText('Add'));
  expect(r.addRoom).toHaveBeenCalledWith({}, 1, 'Hall');
  expect(await screen.findByText('Hall')).toBeOnTheScreen();
});

test('Edit mode: delete asks for confirmation, Up and Down reorder, tapping a name renames', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  });
  r.deleteRoom.mockImplementation(async (_db, id) => {
    rooms = rooms.filter((x) => x.id !== id);
  });
  await render(<RoomList />);
  await screen.findByText('Bath');
  expect(screen.queryByLabelText('Delete Bath')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Edit rooms'));

  await fireEvent.press(screen.getByLabelText('Move Bath up'));
  expect(r.moveRoom).toHaveBeenCalledWith({}, 11, 'up');
  await fireEvent.press(screen.getByLabelText('Move Kitchen down'));
  expect(r.moveRoom).toHaveBeenCalledWith({}, 10, 'down');

  await fireEvent.press(screen.getByLabelText('Rename Kitchen'));
  await fireEvent.changeText(screen.getByLabelText('Room name'), 'Galley');
  await fireEvent.press(screen.getByLabelText('Save'));
  expect(r.renameRoom).toHaveBeenCalledWith({}, 10, 'Galley');

  await fireEvent.press(screen.getByLabelText('Delete Bath'));
  expect(alert).toHaveBeenCalled();
  expect(r.deleteRoom).toHaveBeenCalledWith({}, 11);
  expect(screen.queryByText('Bath')).toBeNull();
});

test('Finish asks for confirmation, calls finishInspection, then hides edit controls', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.text === 'Finish and lock')?.onPress?.();
  });
  items = [{ ...items[0] }, { ...items[1], condition: 'good' }, { id: 3, room_id: 11, name: 'Tub', condition: 'good', note: null, sort: 0 }];
  const finishedAt = new Date(2026, 0, 20).getTime();
  r.finishInspection.mockImplementation(async () => {
    r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', kind: 'move_in', started_at: 0, finished_at: finishedAt } as never);
  });
  await render(<RoomList />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Finish inspection' }));
  expect(alert).toHaveBeenCalledWith('Finish this inspection?', expect.stringContaining('lock'), expect.any(Array));
  expect(r.finishInspection).toHaveBeenCalledWith({}, 1);
  expect(await screen.findByText(`Finished ${shortDate(finishedAt)}. Locked so the report can be trusted.`)).toBeOnTheScreen();
  for (const label of ['Finish inspection', 'Add room', 'Edit rooms']) {
    expect(screen.queryByLabelText(label)).toBeNull();
  }
  expect(screen.getByLabelText('Open Kitchen, 2 of 2 items')).toBeOnTheScreen();
});

test('cancelling the Finish confirmation does not finish', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === 'cancel')?.onPress?.();
  });
  items = [{ ...items[0] }, { ...items[1], condition: 'good' }, { id: 3, room_id: 11, name: 'Tub', condition: 'good', note: null, sort: 0 }];
  await render(<RoomList />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Finish inspection' }));
  expect(r.finishInspection).not.toHaveBeenCalled();
});

test('Export report shows only for a finished inspection and opens the export screen', async () => {
  const { router } = jest.requireMock('expo-router');
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  expect(screen.queryByLabelText('Export report')).toBeNull();

  r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', kind: 'move_in', started_at: 0, finished_at: 5 } as never);
  await render(<RoomList />);
  await fireEvent.press(await screen.findByLabelText('Export report'));
  expect(router.push).toHaveBeenCalledWith('/inspection/1/export');
});
