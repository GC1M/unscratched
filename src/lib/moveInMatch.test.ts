/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrations } from '@/db/migrations';
import { findMoveInItem } from './moveInMatch';

// Fake SQLiteDatabase backed by Node's built-in SQLite (same approach as src/db/db.test.ts).
// findMoveInItem only reads, so getFirstAsync is all it needs.
let raw: DatabaseSync;
let db: SQLiteDatabase;
const insert = async (sql: string, ...params: SQLInputValue[]) =>
  Number(raw.prepare(sql).run(...params).lastInsertRowid);
const inspection = (kind: string, linked: number | null = null) =>
  insert(
    'INSERT INTO inspection (address, kind, started_at, linked_move_in_id) VALUES (?, ?, 0, ?)',
    'A',
    kind,
    linked,
  );
const room = (inspectionId: number, name: string, sort: number) =>
  insert('INSERT INTO room (inspection_id, name, sort) VALUES (?, ?, ?)', inspectionId, name, sort);
const item = (roomId: number, name: string, sort: number) =>
  insert('INSERT INTO item (room_id, name, sort) VALUES (?, ?, ?)', roomId, name, sort);

let moveIn: number;
let moveOut: number;

beforeEach(async () => {
  raw = new DatabaseSync(':memory:');
  migrations.forEach((sql) => raw.exec(sql));
  db = {
    getFirstAsync: async (sql: string, ...params: SQLInputValue[]) => raw.prepare(sql).get(...params) ?? null,
  } as unknown as SQLiteDatabase;
  moveIn = await inspection('move_in');
  moveOut = await inspection('move_out', moveIn);
});

test('matches the room and item with the same name and sort', async () => {
  // Duplicate names in the move-in: the same-sort one wins.
  const otherBedroom = await room(moveIn, 'Bedroom', 0);
  await item(otherBedroom, 'Walls', 1);
  const bedroom = await room(moveIn, 'Bedroom', 1);
  await item(bedroom, 'Walls', 0);
  const walls = await item(bedroom, 'Walls', 1);

  const out = await item(await room(moveOut, 'Bedroom', 1), 'Walls', 1);
  expect((await findMoveInItem(db, out))?.id).toBe(walls);
});

test('falls back to the same name when the sort differs', async () => {
  const kitchen = await room(moveIn, 'Kitchen', 3);
  await item(kitchen, 'Sink', 0);
  const oven = await item(kitchen, 'Oven', 5);

  const out = await item(await room(moveOut, 'Kitchen', 0), 'Oven', 0);
  expect((await findMoveInItem(db, out))?.id).toBe(oven);
});

test('returns null when no room or item matches', async () => {
  const kitchen = await room(moveIn, 'Kitchen', 0);
  await item(kitchen, 'Sink', 0);

  const outKitchen = await room(moveOut, 'Kitchen', 0);
  expect(await findMoveInItem(db, await item(outKitchen, 'Oven', 0))).toBeNull();
  expect(await findMoveInItem(db, await item(await room(moveOut, 'Garage', 1), 'Sink', 0))).toBeNull();
});

test('returns null for a move-in item, an unlinked move-out, or a missing item', async () => {
  const sink = await item(await room(moveIn, 'Kitchen', 0), 'Sink', 0);
  expect(await findMoveInItem(db, sink)).toBeNull();

  const unlinked = await inspection('move_out');
  expect(await findMoveInItem(db, await item(await room(unlinked, 'Kitchen', 0), 'Sink', 0))).toBeNull();

  expect(await findMoveInItem(db, 999)).toBeNull();
});
