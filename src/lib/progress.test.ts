import type { Item, Room } from '@/db/types';

import { progress } from './progress';

const room = (id: number): Room => ({ id, inspection_id: 1, name: `R${id}`, sort: id });
const item = (id: number, room_id: number, condition: Item['condition']): Item => ({
  id,
  room_id,
  name: `I${id}`,
  condition,
  note: null,
  sort: id,
});

test('an empty room is not done', () => {
  expect(progress([room(1)], [])).toEqual({ roomsDone: 0, roomsTotal: 1, itemsDone: 0, itemsTotal: 0 });
});

test('a partly inspected room is not done', () => {
  const items = [item(1, 1, 'good'), item(2, 1, null), item(3, 2, 'fair')];
  expect(progress([room(1), room(2)], items)).toEqual({ roomsDone: 1, roomsTotal: 2, itemsDone: 2, itemsTotal: 3 });
});

test('all items set means all rooms done', () => {
  const items = [item(1, 1, 'good'), item(2, 1, 'damaged'), item(3, 2, 'fair')];
  expect(progress([room(1), room(2)], items)).toEqual({ roomsDone: 2, roomsTotal: 2, itemsDone: 3, itemsTotal: 3 });
});
