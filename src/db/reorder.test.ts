/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrate } from './migrations';
import * as repo from './repo';

// Minimal node:sqlite fake (same shape as the one in db.test.ts, which is not exported).
function fakeDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  return {
    execAsync: async (sql: string) => raw.exec(sql),
    runAsync: async (sql: string, ...params: SQLInputValue[]) => {
      const r = raw.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getFirstAsync: async (sql: string, ...params: SQLInputValue[]) => raw.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql: string, ...params: SQLInputValue[]) => raw.prepare(sql).all(...params),
    withTransactionAsync: async (task: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as SQLiteDatabase;
}

test('any sequence of moves, adds, and deletes keeps room sort contiguous from 0', async () => {
  const db = fakeDb();
  await migrate(db);
  const insp = await repo.createInspection(db, { address: 'x' });
  const ids: number[] = [];
  for (const name of ['A', 'B', 'C', 'D', 'E']) ids.push(await repo.addRoom(db, insp, name));

  const steps: (() => Promise<void>)[] = [
    () => repo.moveRoom(db, ids[4], 'up'),
    () => repo.moveRoom(db, ids[0], 'up'),
    () => repo.moveRoom(db, ids[0], 'down'),
    () => repo.deleteRoom(db, ids[2]),
    () => repo.moveRoom(db, ids[4], 'down'),
    () => repo.addRoom(db, insp, 'F').then(() => undefined),
    () => repo.moveRoom(db, ids[1], 'up'),
    () => repo.deleteRoom(db, ids[0]),
  ];
  for (const step of steps) {
    await step();
    const sorts = (await repo.listRooms(db, insp)).map((r) => r.sort);
    expect(sorts).toEqual(sorts.map((_, i) => i));
  }
  expect((await repo.listRooms(db, insp)).map((r) => r.name)).toEqual(['B', 'D', 'E', 'F']);
});
