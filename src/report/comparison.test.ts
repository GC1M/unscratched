import type { Condition, Inspection, Item, Photo } from '@/db/types';

import { buildComparison, isWorsened } from './comparison';
import type { ReportData, ReportRoom } from './types';

const insp = (id: number, kind: Inspection['kind']): Inspection => ({
  id,
  address: '12 Elm St',
  unit: null,
  kind,
  started_at: 0,
  finished_at: 1,
  tenant_name: null,
  landlord_name: null,
  linked_move_in_id: kind === 'move_out' ? 1 : null,
  move_out_date: null,
});

let nextId = 1;
const it = (name: string, condition: Condition | null, sort = 0, photos: Photo[] = []) => ({
  item: { id: nextId++, room_id: 0, name, condition, note: null, sort } as Item,
  photos,
});
const room = (name: string, sort: number, items: ReportRoom['items']): ReportRoom => ({
  room: { id: nextId++, inspection_id: 0, name, sort },
  items,
});
const data = (inspection: Inspection, rooms: ReportRoom[], thumbnails: Record<number, string> = {}): ReportData => ({
  inspection,
  rooms,
  thumbnails,
  acknowledgement: null,
  generatedAt: 42,
});

const changes = (moveIn: ReportRoom[], moveOut: ReportRoom[]) =>
  buildComparison(data(insp(1, 'move_in'), moveIn), data(insp(2, 'move_out'), moveOut)).rooms.flatMap((r) =>
    r.items.map((i) => [r.name, i.name, i.moveIn?.item.condition, i.moveOut?.item.condition, i.worsened]),
  );

test('good to damaged is flagged, fair to good is not, unchanged is not', () => {
  const c = buildComparison(
    data(insp(1, 'move_in'), [room('Kitchen', 0, [it('Oven', 'good', 0), it('Sink', 'fair', 1), it('Floor', 'fair', 2)])]),
    data(insp(2, 'move_out'), [room('Kitchen', 0, [it('Oven', 'damaged', 0), it('Sink', 'good', 1), it('Floor', 'fair', 2)])]),
  );
  expect(c.rooms[0].items.map((i) => [i.name, i.worsened])).toEqual([
    ['Oven', true],
    ['Sink', false],
    ['Floor', false],
  ]);
  expect(c.worsenedCount).toBe(1);
  expect(c.moveIn.id).toBe(1);
  expect(c.moveOut.id).toBe(2);
  expect(c.generatedAt).toBe(42);
});

test('worsening follows good < fair < damaged', () => {
  expect(isWorsened('good', 'fair')).toBe(true);
  expect(isWorsened('fair', 'damaged')).toBe(true);
  expect(isWorsened('damaged', 'good')).toBe(false);
  expect(isWorsened('damaged', 'damaged')).toBe(false);
});

test('a null condition on either side is never worsened', () => {
  for (const c of ['good', 'fair', 'damaged'] as const) {
    expect(isWorsened(null, c)).toBe(false);
    expect(isWorsened(c, null)).toBe(false);
  }
  expect(isWorsened(null, null)).toBe(false);
  expect(changes([room('Bath', 0, [it('Tub', null)])], [room('Bath', 0, [it('Tub', 'damaged')])])).toEqual([
    ['Bath', 'Tub', null, 'damaged', false],
  ]);
});

test('items present on only one side are kept unpaired and never worsened', () => {
  expect(
    changes(
      [room('Kitchen', 0, [it('Oven', 'good', 0), it('Toaster', 'good', 1)])],
      [room('Kitchen', 0, [it('Oven', 'good', 0), it('Fridge', 'damaged', 1)])],
    ),
  ).toEqual([
    ['Kitchen', 'Oven', 'good', 'good', false],
    ['Kitchen', 'Toaster', 'good', undefined, false],
    ['Kitchen', 'Fridge', undefined, 'damaged', false],
  ]);
});

test('rooms present on only one side keep all their items unpaired', () => {
  expect(changes([room('Den', 0, [it('Rug', 'good')])], [room('Attic', 0, [it('Beam', 'fair')])])).toEqual([
    ['Den', 'Rug', 'good', undefined, false],
    ['Attic', 'Beam', undefined, 'fair', false],
  ]);
});

test('pairs by name and sort first, then by name; never by position alone', () => {
  // Two "Window" items: each pairs with the one at the same sort even though move-out lists them swapped.
  // "Door" moved to a different sort and still pairs by name.
  expect(
    changes(
      [room('Bed', 0, [it('Window', 'good', 0), it('Window', 'fair', 1), it('Door', 'good', 2)])],
      [room('Bed', 5, [it('Door', 'damaged', 0), it('Window', 'fair', 1), it('Window', 'good', 0)])],
    ),
  ).toEqual([
    ['Bed', 'Window', 'good', 'good', false],
    ['Bed', 'Window', 'fair', 'fair', false],
    ['Bed', 'Door', 'good', 'damaged', true],
  ]);
});

test('merges both sides thumbnails', () => {
  const c = buildComparison(data(insp(1, 'move_in'), [], { 1: 'a' }), data(insp(2, 'move_out'), [], { 2: 'b' }));
  expect(c.thumbnails).toEqual({ 1: 'a', 2: 'b' });
  expect(c.rooms).toEqual([]);
});
