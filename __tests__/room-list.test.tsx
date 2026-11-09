import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as repo from '@/db/repo';
import type { Room } from '@/db/types';

import RoomList from '../app/inspection/[id]/index';

jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));
jest.mock('@/db/repo');
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    Stack: { Screen: () => null },
    router: { push: jest.fn() },
    useLocalSearchParams: () => ({ id: '1' }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const r = jest.mocked(repo);
let rooms: Room[];

beforeEach(() => {
  jest.clearAllMocks();
  rooms = [
    { id: 10, inspection_id: 1, name: 'Kitchen', sort: 0 },
    { id: 11, inspection_id: 1, name: 'Bath', sort: 1 },
  ];
  r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', finished_at: null } as never);
  r.listRooms.mockImplementation(async () => rooms);
  r.listInspectionItems.mockResolvedValue([
    { id: 1, room_id: 10, name: 'Walls', condition: 'good', note: null, sort: 0 },
    { id: 2, room_id: 10, name: 'Floor', condition: null, note: null, sort: 1 },
  ]);
});

test('lists rooms with item progress', async () => {
  await render(<RoomList />);
  expect(await screen.findByText('Kitchen')).toBeOnTheScreen();
  expect(screen.getByText('1/2 items')).toBeOnTheScreen();
  expect(screen.getByText('0/0 items')).toBeOnTheScreen();
  expect(screen.getByText('0 of 2 rooms done')).toBeOnTheScreen();
  expect(r.listInspectionItems).toHaveBeenCalledWith({}, 1);
  expect(r.listItems).not.toHaveBeenCalled();
});

test('adding a room shows it in the list', async () => {
  r.addRoom.mockImplementation(async (_db, _insp, name) => {
    rooms = [...rooms, { id: 12, inspection_id: 1, name, sort: 2 }];
    return 12;
  });
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  await fireEvent.changeText(screen.getByLabelText('New room name'), 'Hall');
  await fireEvent.press(screen.getByLabelText('Add room'));
  expect(r.addRoom).toHaveBeenCalledWith({}, 1, 'Hall');
  expect(await screen.findByText('Hall')).toBeOnTheScreen();
});

test('deleting a room asks for confirmation, then removes it', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  });
  r.deleteRoom.mockImplementation(async (_db, id) => {
    rooms = rooms.filter((x) => x.id !== id);
  });
  await render(<RoomList />);
  await screen.findByText('Bath');
  await fireEvent.press(screen.getByLabelText('Delete Bath'));
  expect(alert).toHaveBeenCalled();
  expect(r.deleteRoom).toHaveBeenCalledWith({}, 11);
  expect(screen.queryByText('Bath')).toBeNull();
});

test('Up and Down call moveRoom', async () => {
  await render(<RoomList />);
  await screen.findByText('Bath');
  await fireEvent.press(screen.getByLabelText('Move Bath up'));
  expect(r.moveRoom).toHaveBeenCalledWith({}, 11, 'up');
  await fireEvent.press(screen.getByLabelText('Move Kitchen down'));
  expect(r.moveRoom).toHaveBeenCalledWith({}, 10, 'down');
});

test('rename inline saves the new name', async () => {
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  await fireEvent.press(screen.getByLabelText('Rename Kitchen'));
  await fireEvent.changeText(screen.getByLabelText('Room name'), 'Galley');
  await fireEvent.press(screen.getByLabelText('Save'));
  expect(r.renameRoom).toHaveBeenCalledWith({}, 10, 'Galley');
});

test('Finish asks for confirmation, calls finishInspection, then hides edit controls', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.text === 'Finish')?.onPress?.();
  });
  const finishedAt = new Date(2026, 0, 20).getTime();
  r.finishInspection.mockImplementation(async () => {
    r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', finished_at: finishedAt } as never);
  });
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  await fireEvent.press(screen.getByRole('button', { name: 'Finish inspection' }));
  expect(alert).toHaveBeenCalledWith('Finish inspection?', expect.stringContaining("can't be edited"), expect.any(Array));
  expect(r.finishInspection).toHaveBeenCalledWith({}, 1);
  expect(await screen.findByText(`Finished ${new Date(finishedAt).toLocaleDateString()}`)).toBeOnTheScreen();
  for (const label of ['Finish inspection', 'Add room', 'New room name', 'Rename Kitchen', 'Delete Kitchen', 'Move Bath up']) {
    expect(screen.queryByLabelText(label)).toBeNull();
  }
  expect(screen.getByLabelText('Open Kitchen')).toBeOnTheScreen();
});

test('cancelling the Finish confirmation does not finish', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === 'cancel')?.onPress?.();
  });
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  await fireEvent.press(screen.getByRole('button', { name: 'Finish inspection' }));
  expect(r.finishInspection).not.toHaveBeenCalled();
});

test('Export report shows only for a finished inspection and opens the export screen', async () => {
  const { router } = jest.requireMock('expo-router');
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  expect(screen.queryByLabelText('Export report')).toBeNull();

  r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', finished_at: 5 } as never);
  await render(<RoomList />);
  await fireEvent.press(await screen.findByLabelText('Export report'));
  expect(router.push).toHaveBeenCalledWith('/inspection/1/export');
});

test('Start move-out shows only for a finished move-in and opens the new inspection', async () => {
  const { router } = jest.requireMock('expo-router');
  r.copyFromMoveIn.mockResolvedValue(7);
  for (const insp of [
    { kind: 'move_in', finished_at: null },
    { kind: 'move_out', finished_at: 5 },
  ]) {
    r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', ...insp } as never);
    await render(<RoomList />);
    await screen.findByText('Kitchen');
    expect(screen.queryByLabelText('Start move-out')).toBeNull();
  }

  r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', kind: 'move_in', finished_at: 5 } as never);
  await render(<RoomList />);
  await fireEvent.press(await screen.findByLabelText('Start move-out'));
  expect(r.copyFromMoveIn).toHaveBeenCalledWith({}, 1);
  expect(router.push).toHaveBeenCalledWith('/inspection/7');
});

test('Start move-out failure shows an alert instead of navigating', async () => {
  const { router } = jest.requireMock('expo-router');
  router.push.mockClear();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  r.copyFromMoveIn.mockRejectedValue(new Error('Only a finished move-in can start a move-out.'));
  r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', kind: 'move_in', finished_at: 5 } as never);
  await render(<RoomList />);
  await fireEvent.press(await screen.findByLabelText('Start move-out'));
  expect(alert).toHaveBeenCalledWith('Could not start move-out', 'Only a finished move-in can start a move-out.');
  expect(router.push).not.toHaveBeenCalled();
});
