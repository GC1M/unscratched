import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import * as repo from '@/db/repo';
import type { Item } from '@/db/types';

import RoomItems from '../app/inspection/[id]/room/[roomId]';

jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));
jest.mock('@/db/repo');
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    Stack: { Screen: () => null },
    router: { push: jest.fn() },
    useLocalSearchParams: () => ({ id: '1', roomId: '10' }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const r = jest.mocked(repo);
let items: Item[];

beforeEach(() => {
  jest.clearAllMocks();
  items = [
    { id: 1, room_id: 10, name: 'Walls', condition: 'damaged', note: null, sort: 0 },
    { id: 2, room_id: 10, name: 'Floor', condition: null, note: null, sort: 1 },
  ];
  r.listRooms.mockResolvedValue([{ id: 10, inspection_id: 1, name: 'Kitchen', sort: 0 }]);
  r.listItems.mockImplementation(async () => items);
});

test('lists items with condition, and tapping opens the item', async () => {
  await render(<RoomItems />);
  expect(await screen.findByText('Damaged')).toBeOnTheScreen();
  expect(screen.getByText('Not set')).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Open Floor'));
  expect(router.push).toHaveBeenCalledWith('/item/2');
});

test('add, rename, and delete items', async () => {
  r.addItem.mockImplementation(async (_db, roomId, name) => {
    items = [...items, { id: 3, room_id: roomId, name, condition: null, note: null, sort: 2 }];
    return 3;
  });
  r.deleteItem.mockImplementation(async (_db, id) => {
    items = items.filter((x) => x.id !== id);
  });
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  });
  await render(<RoomItems />);
  await screen.findByText('Walls');

  await fireEvent.changeText(screen.getByLabelText('New item name'), 'Window');
  await fireEvent.press(screen.getByLabelText('Add item'));
  expect(await screen.findByText('Window')).toBeOnTheScreen();

  await fireEvent.press(screen.getByLabelText('Rename Walls'));
  await fireEvent.changeText(screen.getByLabelText('Item name'), 'Paint');
  await fireEvent.press(screen.getByLabelText('Save'));
  expect(r.renameItem).toHaveBeenCalledWith({}, 1, 'Paint');

  await fireEvent.press(screen.getByLabelText('Delete Floor'));
  expect(r.deleteItem).toHaveBeenCalledWith({}, 2);
  expect(screen.queryByText('Floor')).toBeNull();
});
