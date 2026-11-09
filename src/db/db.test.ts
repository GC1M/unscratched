/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrate, migrations } from './migrations';
import * as repo from './repo';

// Fake SQLiteDatabase backed by Node's built-in SQLite, implementing only the methods src/db uses.
function fakeDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const db = {
    execAsync: jest.fn(async (sql: string) => {
      raw.exec(sql);
    }),
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
  };
  return { raw, db: db as unknown as SQLiteDatabase, execAsync: db.execAsync };
}

async function setup() {
  const f = fakeDb();
  await migrate(f.db);
  return f;
}

const count = (raw: DatabaseSync, table: string) =>
  (raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('migrate', () => {
  test('applies migrations in order, sets user_version, and a second run is a no-op', async () => {
    const { raw, db, execAsync } = fakeDb();
    await migrate(db);
    const applied = execAsync.mock.calls.map((c) => c[0]).filter((sql) => !sql.startsWith('PRAGMA'));
    expect(applied).toEqual(migrations);
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: migrations.length });

    execAsync.mockClear();
    await migrate(db);
    expect(execAsync).not.toHaveBeenCalled();
  });

  test('only applies migrations newer than user_version', async () => {
    const { raw, db, execAsync } = fakeDb();
    raw.exec(`PRAGMA user_version = ${migrations.length}`);
    await migrate(db);
    expect(execAsync).not.toHaveBeenCalled();
  });
});

describe('repo', () => {
  test('inspections round-trip and list newest first', async () => {
    const { db } = await setup();
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    const a = await repo.createInspection(db, { address: '1 Main St', unit: '2B', tenant_name: 'Ana' });
    now.mockReturnValue(2000);
    const b = await repo.createInspection(db, { address: '9 Elm St' });
    now.mockRestore();

    expect(await repo.getInspection(db, a)).toEqual({
      id: a,
      address: '1 Main St',
      unit: '2B',
      kind: 'move_in',
      started_at: 1000,
      finished_at: null,
      tenant_name: 'Ana',
      landlord_name: null,
      linked_move_in_id: null,
      move_out_date: null,
    });
    expect((await repo.listInspections(db)).map((i) => i.id)).toEqual([b, a]);
    expect(await repo.getInspection(db, 999)).toBeNull();
  });

  test('rooms append, rename, reorder, and delete keep sort contiguous', async () => {
    const { db } = await setup();
    const insp = await repo.createInspection(db, { address: 'x' });
    const k = await repo.addRoom(db, insp, 'Kitchen');
    const b = await repo.addRoom(db, insp, 'Bath');
    const l = await repo.addRoom(db, insp, 'Living');
    const rooms = async () => (await repo.listRooms(db, insp)).map((r) => [r.name, r.sort]);

    expect(await rooms()).toEqual([['Kitchen', 0], ['Bath', 1], ['Living', 2]]);

    await repo.renameRoom(db, b, 'Bathroom');
    await repo.moveRoom(db, l, 'up');
    expect(await rooms()).toEqual([['Kitchen', 0], ['Living', 1], ['Bathroom', 2]]);

    await repo.moveRoom(db, k, 'up'); // already first
    await repo.moveRoom(db, b, 'down'); // already last
    expect(await rooms()).toEqual([['Kitchen', 0], ['Living', 1], ['Bathroom', 2]]);

    await repo.moveRoom(db, k, 'down');
    expect(await rooms()).toEqual([['Living', 0], ['Kitchen', 1], ['Bathroom', 2]]);

    await repo.deleteRoom(db, l);
    expect(await rooms()).toEqual([['Kitchen', 0], ['Bathroom', 1]]);
    await repo.addRoom(db, insp, 'Hall');
    expect(await rooms()).toEqual([['Kitchen', 0], ['Bathroom', 1], ['Hall', 2]]);
  });

  test('items append, rename, set condition and note, delete', async () => {
    const { db } = await setup();
    const insp = await repo.createInspection(db, { address: 'x' });
    const room = await repo.addRoom(db, insp, 'Kitchen');
    const walls = await repo.addItem(db, room, 'Walls');
    const floor = await repo.addItem(db, room, 'Floor');

    await repo.renameItem(db, floor, 'Flooring');
    await repo.setCondition(db, walls, 'damaged');
    await repo.setNote(db, walls, 'Scuff by door');
    expect(await repo.getItem(db, walls)).toEqual({
      id: walls,
      room_id: room,
      name: 'Walls',
      condition: 'damaged',
      note: 'Scuff by door',
      sort: 0,
    });
    expect((await repo.listItems(db, room)).map((i) => [i.name, i.sort])).toEqual([['Walls', 0], ['Flooring', 1]]);

    await repo.setCondition(db, walls, null);
    expect((await repo.getItem(db, walls))?.condition).toBeNull();

    await repo.deleteItem(db, floor);
    expect(await repo.getItem(db, floor)).toBeNull();
  });

  test('photos insert and list by item', async () => {
    const { db } = await setup();
    const insp = await repo.createInspection(db, { address: 'x' });
    const item = await repo.addItem(db, await repo.addRoom(db, insp, 'Kitchen'), 'Walls');
    const photo = {
      item_id: item,
      file_uri: 'file:///p.jpg',
      sha256: 'ab'.repeat(32),
      captured_at: 5,
      width: 1600,
      height: 1200,
      source: 'camera' as const,
    };
    const id = await repo.insertPhoto(db, photo);
    expect(await repo.listPhotos(db, item)).toEqual([{ id, ...photo }]);
  });

  test('deleting an inspection cascades to rooms, items, and photos', async () => {
    const { raw, db } = await setup();
    const keep = await repo.createInspection(db, { address: 'keep' });
    await repo.addRoom(db, keep, 'Kept');
    const insp = await repo.createInspection(db, { address: 'x' });
    const room = await repo.addRoom(db, insp, 'Kitchen');
    const item = await repo.addItem(db, room, 'Walls');
    await repo.insertPhoto(db, {
      item_id: item,
      file_uri: 'f',
      sha256: 's',
      captured_at: 1,
      width: 1,
      height: 1,
      source: 'camera',
    });

    await repo.deleteInspection(db, insp);
    expect(await repo.getInspection(db, insp)).toBeNull();
    expect(count(raw, 'room')).toBe(1);
    expect(count(raw, 'item')).toBe(0);
    expect(count(raw, 'photo')).toBe(0);
  });

  test('schema rejects invalid condition', async () => {
    const { db } = await setup();
    const insp = await repo.createInspection(db, { address: 'x' });
    const item = await repo.addItem(db, await repo.addRoom(db, insp, 'Kitchen'), 'Walls');
    await expect(repo.setCondition(db, item, 'broken' as never)).rejects.toThrow();
  });
});
