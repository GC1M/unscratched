import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import * as repo from '@/db/repo';
import type { Item } from '@/db/types';
import { shortDate } from '@/lib/format';

import RoomItems from '../app/inspection/[id]/room/[roomId]';

jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));
jest.mock('@/db/repo');
jest.mock('expo-router', () =>
  jest.requireActual('@/test/expoRouter').mockExpoRouter({ useLocalSearchParams: () => ({ id: '1', roomId: '10' }) }),
);

const r = jest.mocked(repo);
let items: Item[];

beforeEach(() => {
  jest.clearAllMocks();
  items = [
    { id: 1, room_id: 10, name: 'Walls', condition: 'damaged', note: null, sort: 0 },
    { id: 2, room_id: 10, name: 'Floor', condition: null, note: null, sort: 1 },
  ];
  r.getRoom.mockResolvedValue({ id: 10, inspection_id: 1, name: 'Kitchen', sort: 0 });
  r.listItems.mockImplementation(async () => items);
  r.countPhotosByItem.mockResolvedValue(new Map([[1, 2]]));
});

test('lists items with condition and photo count, and tapping opens the item', async () => {
  await render(<RoomItems />);
  expect(await screen.findByText('Damaged, 2 photos')).toBeOnTheScreen();
  expect(screen.getByText('Not checked')).toBeOnTheScreen();
  expect(screen.getByText('1 of 2 items checked')).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Open Floor, Not checked'));
  expect(router.push).toHaveBeenCalledWith('/item/2');
});

test('Continue opens the next unchecked item', async () => {
  await render(<RoomItems />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue with Floor' }));
  expect(router.push).toHaveBeenCalledWith('/item/2');
});

test('once every item is checked, Done returns to the room list', async () => {
  items = items.map((i) => ({ ...i, condition: 'good' }));
  await render(<RoomItems />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Done with Kitchen' }));
  expect(router.dismissTo).toHaveBeenCalledWith('/inspection/1');
});

const insideAccessible = (el: ReturnType<typeof screen.getByRole>) => {
  for (let p = el.parent; p; p = p.parent) if (p.props.accessible) return true;
  return false;
};

test('Edit mode: the delete control is not nested inside the row button, so VoiceOver can reach it', async () => {
  await render(<RoomItems />);
  await screen.findByText('Walls');
  await fireEvent.press(screen.getByLabelText('Edit items'));
  expect(insideAccessible(screen.getByRole('button', { name: 'Rename Walls' }))).toBe(false);
  expect(insideAccessible(screen.getByRole('button', { name: 'Delete Walls' }))).toBe(false);
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

  await fireEvent.press(screen.getByLabelText('Add item'));
  await fireEvent.changeText(screen.getByLabelText('New item name'), 'Window');
  await fireEvent.press(screen.getByLabelText('Add'));
  expect(await screen.findByText('Window')).toBeOnTheScreen();

  await fireEvent.press(screen.getByLabelText('Edit items'));
  await fireEvent.press(screen.getByLabelText('Rename Walls'));
  await fireEvent.changeText(screen.getByLabelText('Item name'), 'Paint');
  await fireEvent.press(screen.getByLabelText('Save'));
  expect(r.renameItem).toHaveBeenCalledWith({}, 1, 'Paint');

  await fireEvent.press(screen.getByLabelText('Delete Floor'));
  expect(r.deleteItem).toHaveBeenCalledWith({}, 2);
  expect(screen.queryByText('Floor')).toBeNull();
});

test('finished inspection hides add, edit, and continue', async () => {
  r.getInspection.mockResolvedValue({ id: 1, finished_at: 5 } as never);
  await render(<RoomItems />);
  expect(await screen.findByText(`Finished ${shortDate(5)}. Locked so the report can be trusted.`)).toBeOnTheScreen();
  for (const label of ['Add item', 'Edit items', 'Continue with Floor']) {
    expect(screen.queryByLabelText(label)).toBeNull();
  }
  expect(screen.getByLabelText('Open Walls, Damaged, 2 photos')).toBeOnTheScreen();
});
