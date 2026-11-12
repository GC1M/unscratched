/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrate, migrations } from './migrations';
import * as repo from './repo';
import { expandTemplate } from '../templates/rooms';

// Photo files: uris that exist, and the ones repo deleted.
const mockExisting = new Set<string>();
const mockDeleted: string[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///docs' } },
  File: class {
    uri: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
    }
    get exists() {
      return mockExisting.has(this.uri);
    }
    delete() {
      mockDeleted.push(this.uri);
    }
  },
}));
beforeEach(() => {
  mockExisting.clear();
  mockDeleted.length = 0;
});

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

  test('the currency migration keeps existing rows, with a null (USD) currency', async () => {
    const { raw, db } = fakeDb();
    for (const sql of migrations.slice(0, -1)) raw.exec(sql);
    raw.exec(`PRAGMA user_version = ${migrations.length - 1}`);
    raw.exec("INSERT INTO inspection (address, kind, started_at) VALUES ('1 Main St', 'move_in', 1)");
    await migrate(db);
    expect(raw.prepare('SELECT address, currency FROM inspection').all()).toEqual([{ address: '1 Main St', currency: null }]);
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
      state: null,
      landlord_email: null,
      portal_url: null,
      sent_at: null,
      sent_channel: null,
      deposit_split: null,
      currency: null,
    });
    expect((await repo.listInspections(db)).map((i) => i.id)).toEqual([b, a]);
    expect(await repo.getInspection(db, 999)).toBeNull();
  });

  test('createInspectionFromTemplate inserts rooms and items in template order', async () => {
    const { raw, db } = await setup();
    const id = await repo.createInspectionFromTemplate(db, { address: '1 Main St', unit: '2B' });
    expect((await repo.getInspection(db, id))?.unit).toBe('2B');

    const expected = expandTemplate();
    const rooms = await repo.listRooms(db, id);
    expect(rooms.map((r) => [r.name, r.sort])).toEqual(expected.map((r) => [r.name, r.sort]));
    for (const [i, room] of rooms.entries()) {
      const items = await repo.listItems(db, room.id);
      expect(items.map((it) => [it.name, it.sort])).toEqual(expected[i].items.map((it) => [it.name, it.sort]));
    }
    expect(count(raw, 'item')).toBe(expected.reduce((n, r) => n + r.items.length, 0));
  });

  test('createInspectionFromTemplate uses the given room names', async () => {
    const { db } = await setup();
    const id = await repo.createInspectionFromTemplate(db, { address: 'x' }, ['Bedroom', 'Den']);
    const rooms = await repo.listRooms(db, id);
    expect(rooms.map((r) => [r.name, r.sort])).toEqual([['Bedroom', 0], ['Den', 1]]);
    expect((await repo.listItems(db, rooms[1].id)).map((it) => it.name)).toEqual(['Walls', 'Floor', 'Ceiling']);
  });

  test('createInspectionFromTemplate uses the given region', async () => {
    const { db } = await setup();
    const id = await repo.createInspectionFromTemplate(db, { address: 'x' }, undefined, 'UK');
    const rooms = await repo.listRooms(db, id);
    expect(rooms.map((r) => r.name)).toEqual(expandTemplate(undefined, 'UK').map((r) => r.name));
  });

  test('createInspectionFromTemplate stores the region currency', async () => {
    const { db } = await setup();
    const currency = async (region?: 'US' | 'UK' | 'CA') =>
      (await repo.getInspection(db, await repo.createInspectionFromTemplate(db, { address: 'x' }, undefined, region)))?.currency;
    expect(await currency()).toBe('USD');
    expect(await currency('US')).toBe('USD');
    expect(await currency('UK')).toBe('GBP');
    expect(await currency('CA')).toBe('CAD');
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

  test('deleting an inspection removes its photo files, keeps others, and unlinks its move-out', async () => {
    const { raw, db } = await setup();
    const photo = (item_id: number, file_uri: string) =>
      repo.insertPhoto(db, { item_id, file_uri, sha256: file_uri, captured_at: 1, width: 1, height: 1, source: 'camera' });
    const insp = await repo.createInspection(db, { address: 'x' });
    const kitchen = await repo.addRoom(db, insp, 'Kitchen');
    await photo(await repo.addItem(db, kitchen, 'Walls'), 'photos/a.jpg');
    await photo(await repo.addItem(db, await repo.addRoom(db, insp, 'Bath'), 'Tub'), 'photos/b.jpg');
    await photo(await repo.addItem(db, kitchen, 'Floor'), 'photos/gone.jpg');
    const other = await repo.createInspection(db, { address: 'y' });
    await photo(await repo.addItem(db, await repo.addRoom(db, other, 'Hall'), 'Door'), 'photos/keep.jpg');
    await repo.finishInspection(db, insp);
    const moveOut = await repo.copyFromMoveIn(db, insp);
    ['a', 'b', 'keep'].forEach((n) => mockExisting.add(`file:///docs/photos/${n}.jpg`));

    await repo.deleteInspection(db, insp);

    expect(mockDeleted.sort()).toEqual(['file:///docs/photos/a.jpg', 'file:///docs/photos/b.jpg']);
    expect(await repo.getInspection(db, insp)).toBeNull();
    expect(count(raw, 'photo')).toBe(1);
    expect(await repo.getInspection(db, moveOut)).toMatchObject({ kind: 'move_out', linked_move_in_id: null });
    expect((await repo.listRooms(db, moveOut)).map((r) => r.name)).toEqual(['Kitchen', 'Bath']);
  });

  test('deleting a room or an item removes their photo files', async () => {
    const { db } = await setup();
    const insp = await repo.createInspection(db, { address: 'x' });
    const room = await repo.addRoom(db, insp, 'Kitchen');
    const walls = await repo.addItem(db, room, 'Walls');
    const floor = await repo.addItem(db, room, 'Floor');
    for (const [item, uri] of [[walls, 'w.jpg'], [floor, 'f.jpg']] as const) {
      await repo.insertPhoto(db, { item_id: item, file_uri: uri, sha256: uri, captured_at: 1, width: 1, height: 1, source: 'camera' });
      mockExisting.add(`file:///docs/${uri}`);
    }
    await repo.deleteItem(db, walls);
    expect(mockDeleted).toEqual(['file:///docs/w.jpg']);
    await repo.deleteRoom(db, room);
    expect(mockDeleted).toEqual(['file:///docs/w.jpg', 'file:///docs/f.jpg']);
  });

  test('listInspectionItems returns every item of one inspection in room then item order', async () => {
    const { db } = await setup();
    const insp = await repo.createInspection(db, { address: 'x' });
    const other = await repo.createInspection(db, { address: 'y' });
    const bath = await repo.addRoom(db, insp, 'Bath');
    const kitchen = await repo.addRoom(db, insp, 'Kitchen');
    await repo.addItem(db, kitchen, 'Walls');
    await repo.addItem(db, bath, 'Tub');
    await repo.addItem(db, bath, 'Sink');
    await repo.addItem(db, await repo.addRoom(db, other, 'Den'), 'Floor');
    await repo.moveRoom(db, kitchen, 'up');
    expect((await repo.listInspectionItems(db, insp)).map((i) => i.name)).toEqual(['Walls', 'Tub', 'Sink']);
  });

  test('listInspectionPhotos returns photos of one inspection in room, item, then capture order', async () => {
    const { db } = await setup();
    const insp = await repo.createInspection(db, { address: 'x' });
    const other = await repo.createInspection(db, { address: 'y' });
    const bath = await repo.addRoom(db, insp, 'Bath');
    const kitchen = await repo.addRoom(db, insp, 'Kitchen');
    const walls = await repo.addItem(db, kitchen, 'Walls');
    const tub = await repo.addItem(db, bath, 'Tub');
    const sink = await repo.addItem(db, bath, 'Sink');
    const den = await repo.addItem(db, await repo.addRoom(db, other, 'Den'), 'Floor');
    await repo.moveRoom(db, kitchen, 'up');
    const add = (item_id: number, name: string, captured_at: number) =>
      repo.insertPhoto(db, { item_id, file_uri: name, sha256: name, captured_at, width: 1, height: 1, source: 'camera' });
    await add(sink, 'sink', 1);
    await add(tub, 'tub-late', 9);
    await add(tub, 'tub-early', 2);
    await add(walls, 'walls', 5);
    await add(den, 'den', 0);
    expect((await repo.listInspectionPhotos(db, insp)).map((p) => p.file_uri)).toEqual(['walls', 'tub-early', 'tub-late', 'sink']);
  });

  test('landlord contact and the sent record save on a finished inspection, which stays locked otherwise', async () => {
    const { db } = await setup();
    const id = await repo.createInspectionFromTemplate(db, { address: '1 Main St' }, ['Kitchen']);
    await repo.finishInspection(db, id);
    await repo.setLandlordContact(db, id, { landlord_email: 'lee@example.com', portal_url: 'https://portal.example.com' });
    jest.spyOn(Date, 'now').mockReturnValue(5000);
    await repo.recordSent(db, id, 'portal');
    jest.mocked(Date.now).mockRestore();
    expect(await repo.getInspection(db, id)).toMatchObject({
      landlord_email: 'lee@example.com',
      portal_url: 'https://portal.example.com',
      sent_at: 5000,
      sent_channel: 'portal',
    });
    await repo.setLandlordContact(db, id, { landlord_email: null, portal_url: null });
    expect(await repo.getInspection(db, id)).toMatchObject({ landlord_email: null, portal_url: null, sent_channel: 'portal' });
    await repo.setDepositSplit(db, id, '{"depositCents":100}');
    expect(await repo.getInspection(db, id)).toMatchObject({ deposit_split: '{"depositCents":100}' });
    const [room] = await repo.listRooms(db, id);
    await expect(repo.renameRoom(db, room.id, 'x')).rejects.toBeInstanceOf(repo.InspectionLockedError);
  });

  test('schema rejects an unknown sent channel', async () => {
    const { db } = await setup();
    const id = await repo.createInspection(db, { address: '1 Main St' });
    await expect(repo.recordSent(db, id, 'fax' as never)).rejects.toThrow();
  });

  test('settings upsert and read back', async () => {
    const { db } = await setup();
    expect(await repo.getSetting(db, 'appearance')).toBeNull();
    await repo.setSetting(db, 'appearance', 'dark');
    await repo.setSetting(db, 'appearance', 'light');
    expect(await repo.getSetting(db, 'appearance')).toBe('light');
  });

  test('getRoom and countPhotosByItem', async () => {
    const { db } = await setup();
    const id = await repo.createInspectionFromTemplate(db, { address: '1 Main St' }, ['Kitchen']);
    const [room] = await repo.listRooms(db, id);
    expect(await repo.getRoom(db, room.id)).toEqual(room);
    const [walls, floor] = await repo.listItems(db, room.id);
    const photo = { file_uri: 'f', sha256: 'x', captured_at: 1, width: 1, height: 1, source: 'camera' as const };
    await repo.insertPhoto(db, { ...photo, item_id: walls.id });
    await repo.insertPhoto(db, { ...photo, item_id: walls.id });
    expect(await repo.countPhotosByItem(db, room.id)).toEqual(new Map([[walls.id, 2]]));
    expect((await repo.countPhotosByItem(db, room.id)).get(floor.id)).toBeUndefined();
  });

  describe('copyFromMoveIn', () => {
    async function moveIn(finish = true) {
      const f = await setup();
      const { db } = f;
      const insp = await repo.createInspection(db, {
        address: '1 Main St',
        unit: '2B',
        tenant_name: 'Tia',
        landlord_name: 'Lou',
        move_out_date: 99,
        state: 'WA',
        currency: 'CAD',
      });
      const kitchen = await repo.addRoom(db, insp, 'Kitchen');
      const bath = await repo.addRoom(db, insp, 'Bath');
      const walls = await repo.addItem(db, kitchen, 'Walls');
      await repo.addItem(db, kitchen, 'Floor');
      await repo.addItem(db, bath, 'Tub');
      await repo.setCondition(db, walls, 'damaged');
      await repo.setNote(db, walls, 'scuff');
      await repo.insertPhoto(db, {
        item_id: walls,
        file_uri: 'f',
        sha256: 's',
        captured_at: 1,
        width: 1,
        height: 1,
        source: 'camera',
      });
      if (finish) await repo.finishInspection(db, insp);
      return { ...f, insp };
    }

    const shape = async (db: SQLiteDatabase, insp: number) =>
      Promise.all(
        (await repo.listRooms(db, insp)).map(async (r) => ({
          name: r.name,
          sort: r.sort,
          items: (await repo.listItems(db, r.id)).map((i) => ({ name: i.name, sort: i.sort })),
        })),
      );

    test('copies rooms and items with no photos or conditions, and links back', async () => {
      const { raw, db, insp } = await moveIn();
      const out = await repo.copyFromMoveIn(db, insp);

      const copy = await repo.getInspection(db, out);
      expect(copy).toMatchObject({
        kind: 'move_out',
        linked_move_in_id: insp,
        address: '1 Main St',
        unit: '2B',
        tenant_name: 'Tia',
        landlord_name: 'Lou',
        move_out_date: 99,
        state: 'WA',
        currency: 'CAD',
        finished_at: null,
      });
      expect(await shape(db, out)).toEqual(await shape(db, insp));
      expect((await shape(db, out)).flatMap((r) => r.items)).toHaveLength(3);
      const items = await repo.listInspectionItems(db, out);
      expect(items.every((i) => i.condition === null && i.note === null)).toBe(true);
      expect(await repo.listInspectionPhotos(db, out)).toEqual([]);
      expect(count(raw, 'photo')).toBe(1);
    });

    test('a second start returns the existing move-out instead of creating another', async () => {
      const { raw, db, insp } = await moveIn();
      const out = await repo.copyFromMoveIn(db, insp);
      await repo.setCondition(db, (await repo.listInspectionItems(db, out))[0].id, 'good');

      expect(await repo.copyFromMoveIn(db, insp)).toBe(out);
      expect(count(raw, 'inspection')).toBe(2);
      expect(count(raw, 'room')).toBe(4);
      expect((await repo.listInspectionItems(db, out))[0].condition).toBe('good');
    });

    test('throws for an unfinished move-in and creates nothing', async () => {
      const { raw, db, insp } = await moveIn(false);
      await expect(repo.copyFromMoveIn(db, insp)).rejects.toThrow('finished move-in');
      expect(count(raw, 'inspection')).toBe(1);
      expect(count(raw, 'room')).toBe(2);
    });

    test('throws for a missing inspection or a finished move-out', async () => {
      const { db, insp } = await moveIn();
      await expect(repo.copyFromMoveIn(db, 999)).rejects.toThrow('finished move-in');
      const out = await repo.copyFromMoveIn(db, insp);
      await repo.finishInspection(db, out);
      await expect(repo.copyFromMoveIn(db, out)).rejects.toThrow('finished move-in');
    });
  });

  describe('finished inspections are locked', () => {
    const EDITS = [
      'setCondition',
      'setNote',
      'renameRoom',
      'addRoom',
      'insertPhoto',
      'addItem',
      'renameItem',
      'moveRoom',
      'deleteItem',
      'deleteRoom',
    ] as const;

    async function fixture() {
      const { db } = await setup();
      const insp = await repo.createInspection(db, { address: 'x' });
      const room = await repo.addRoom(db, insp, 'Kitchen');
      const item = await repo.addItem(db, room, 'Walls');
      const photo = {
        item_id: item,
        file_uri: 'f',
        sha256: 's',
        captured_at: 1,
        width: 1,
        height: 1,
        source: 'camera' as const,
      };
      const edits: Record<(typeof EDITS)[number], () => Promise<unknown>> = {
        setCondition: () => repo.setCondition(db, item, 'good'),
        setNote: () => repo.setNote(db, item, 'note'),
        renameRoom: () => repo.renameRoom(db, room, 'Galley'),
        addRoom: () => repo.addRoom(db, insp, 'Hall'),
        insertPhoto: () => repo.insertPhoto(db, photo),
        addItem: () => repo.addItem(db, room, 'Floor'),
        renameItem: () => repo.renameItem(db, item, 'Paint'),
        moveRoom: () => repo.moveRoom(db, room, 'down'),
        deleteItem: () => repo.deleteItem(db, item),
        deleteRoom: () => repo.deleteRoom(db, room),
      };
      return { db, insp, edits };
    }

    test('edits work before finishing', async () => {
      const { edits } = await fixture();
      for (const edit of Object.values(edits)) await expect(edit()).resolves.not.toThrow();
    });

    test.each(EDITS)('%s throws InspectionLockedError after finishing and changes nothing', async (name) => {
      const { db, insp, edits } = await fixture();
      jest.spyOn(Date, 'now').mockReturnValueOnce(1234);
      await repo.finishInspection(db, insp);
      expect((await repo.getInspection(db, insp))?.finished_at).toBe(1234);
      await expect(edits[name]()).rejects.toThrow(repo.InspectionLockedError);
      expect((await repo.listRooms(db, insp)).map((r) => r.name)).toEqual(['Kitchen']);
      const items = await repo.listInspectionItems(db, insp);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ name: 'Walls', condition: null, note: null });
      expect(await repo.listPhotos(db, items[0].id)).toEqual([]);
    });

    test('finishing twice throws, deleting a finished inspection is allowed', async () => {
      const { db, insp } = await fixture();
      await repo.finishInspection(db, insp);
      await expect(repo.finishInspection(db, insp)).rejects.toThrow(repo.InspectionLockedError);
      await repo.deleteInspection(db, insp);
      expect(await repo.getInspection(db, insp)).toBeNull();
    });
  });

  test('schema rejects invalid condition', async () => {
    const { db } = await setup();
    const insp = await repo.createInspection(db, { address: 'x' });
    const item = await repo.addItem(db, await repo.addRoom(db, insp, 'Kitchen'), 'Walls');
    await expect(repo.setCondition(db, item, 'broken' as never)).rejects.toThrow();
  });

  test('receipts: finished photo hashes only, stored once, first receipt kept', async () => {
    const { db } = await setup();
    const add = async (finish: boolean, hashes: string[]) => {
      const insp = await repo.createInspection(db, { address: 'x' });
      const item = await repo.addItem(db, await repo.addRoom(db, insp, 'Kitchen'), 'Walls');
      for (const sha256 of hashes) {
        await repo.insertPhoto(db, { item_id: item, file_uri: sha256, sha256, captured_at: 1, width: 1, height: 1, source: 'camera' });
      }
      if (finish) await repo.finishInspection(db, insp);
      return insp;
    };
    const done = await add(true, ['a', 'b']);
    await add(false, ['c']);
    expect(await repo.listFinishedPhotoHashes(db)).toEqual([
      { inspection_id: done, sha256: 'a' },
      { inspection_id: done, sha256: 'b' },
    ]);

    expect(await repo.listReceipts(db)).toEqual({});
    await repo.saveReceipts(db, [{ sha256: 'a', receipt_id: 'r1', server_time: 10 }]);
    await repo.saveReceipts(db, [
      { sha256: 'a', receipt_id: 'r2', server_time: 20 },
      { sha256: 'b', receipt_id: 'r3', server_time: 30 },
    ]);
    expect(await repo.listReceipts(db)).toEqual({ a: 10, b: 30 });
  });
});
