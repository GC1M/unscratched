import type { Item, Room } from '@/db/types';

import { nextRoom, nextUnchecked } from './next';

const room = (id: number): Room => ({ id, inspection_id: 1, name: `R${id}`, sort: id });
const item = (id: number, room_id: number, condition: Item['condition']): Item => ({
  id,
  room_id,
  name: `I${id}`,
  condition,
  note: null,
  sort: id,
});

test('nextUnchecked walks forward then wraps, skipping the current item', () => {
  const items = [item(1, 1, null), item(2, 1, 'good'), item(3, 1, null)];
  expect(nextUnchecked(items, 2)?.id).toBe(3);
  expect(nextUnchecked(items, 3)?.id).toBe(1);
  expect(nextUnchecked(items, 1)?.id).toBe(3);
});

test('nextUnchecked is null when everything else is checked', () => {
  expect(nextUnchecked([item(1, 1, null), item(2, 1, 'fair')], 1)).toBeNull();
  expect(nextUnchecked([], 9)).toBeNull();
});

test('nextRoom is the first room with work left, counting empty rooms', () => {
  const rooms = [room(1), room(2), room(3)];
  const items = [item(1, 1, 'good'), item(2, 3, null)];
  expect(nextRoom(rooms, items)?.id).toBe(2);
  expect(nextRoom([room(1)], [item(1, 1, 'good')])).toBeNull();
});
