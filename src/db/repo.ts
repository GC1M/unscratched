import type { SQLiteDatabase } from 'expo-sqlite';

import { expandTemplate } from '../templates/rooms';

import type { Condition, Inspection, InspectionKind, Item, Photo, Room } from './types';

// Lock: a finished inspection is read-only.

export class InspectionLockedError extends Error {
  constructor() {
    super('This inspection is finished and cannot be edited.');
    this.name = 'InspectionLockedError';
  }
}

const OWNER_FINISHED_AT = {
  inspection: 'SELECT finished_at FROM inspection WHERE id = ?',
  room: 'SELECT i.finished_at FROM room r JOIN inspection i ON i.id = r.inspection_id WHERE r.id = ?',
  item: `SELECT i.finished_at FROM item it JOIN room r ON r.id = it.room_id JOIN inspection i ON i.id = r.inspection_id
         WHERE it.id = ?`,
};

/** finished_at of the inspection that owns the given inspection, room, or item (null if unfinished or missing). */
export async function getFinishedAt(db: SQLiteDatabase, by: keyof typeof OWNER_FINISHED_AT, id: number): Promise<number | null> {
  const row = await db.getFirstAsync<{ finished_at: number | null }>(OWNER_FINISHED_AT[by], id);
  return row?.finished_at ?? null;
}

// ponytail: check-then-write without a transaction for single statements, since callers (e.g. photo capture)
// may already be inside one and expo-sqlite can't nest them. Safe while the app is the only writer.
async function assertEditable(db: SQLiteDatabase, by: keyof typeof OWNER_FINISHED_AT, id: number): Promise<void> {
  if ((await getFinishedAt(db, by, id)) != null) throw new InspectionLockedError();
}

// Inspections

export interface NewInspection {
  address: string;
  unit?: string | null;
  kind?: InspectionKind;
  tenant_name?: string | null;
  landlord_name?: string | null;
  linked_move_in_id?: number | null;
  move_out_date?: number | null;
}

export async function createInspection(db: SQLiteDatabase, input: NewInspection): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO inspection (address, unit, kind, started_at, tenant_name, landlord_name, linked_move_in_id, move_out_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.address,
    input.unit ?? null,
    input.kind ?? 'move_in',
    Date.now(),
    input.tenant_name ?? null,
    input.landlord_name ?? null,
    input.linked_move_in_id ?? null,
    input.move_out_date ?? null,
  );
  return r.lastInsertRowId;
}

/** Creates the inspection plus its template rooms and items in one transaction. */
export async function createInspectionFromTemplate(
  db: SQLiteDatabase,
  input: NewInspection,
  roomNames?: string[],
): Promise<number> {
  let id = 0;
  await db.withTransactionAsync(async () => {
    id = await createInspection(db, input);
    for (const room of expandTemplate(roomNames)) {
      const r = await db.runAsync('INSERT INTO room (inspection_id, name, sort) VALUES (?, ?, ?)', id, room.name, room.sort);
      for (const item of room.items) {
        await db.runAsync('INSERT INTO item (room_id, name, sort) VALUES (?, ?, ?)', r.lastInsertRowId, item.name, item.sort);
      }
    }
  });
  return id;
}

/**
 * Starts a move-out from a finished move-in: same address, people, rooms and items (names and sort),
 * linked back, with no conditions, notes, or photos. Returns the new inspection id.
 */
export async function copyFromMoveIn(db: SQLiteDatabase, moveInId: number): Promise<number> {
  let id = 0;
  await db.withTransactionAsync(async () => {
    const src = await getInspection(db, moveInId);
    if (!src || src.kind !== 'move_in' || src.finished_at == null) {
      throw new Error('Only a finished move-in can start a move-out.');
    }
    id = await createInspection(db, {
      address: src.address,
      unit: src.unit,
      kind: 'move_out',
      tenant_name: src.tenant_name,
      landlord_name: src.landlord_name,
      linked_move_in_id: src.id,
      move_out_date: src.move_out_date,
    });
    for (const room of await listRooms(db, moveInId)) {
      const r = await db.runAsync('INSERT INTO room (inspection_id, name, sort) VALUES (?, ?, ?)', id, room.name, room.sort);
      await db.runAsync(
        'INSERT INTO item (room_id, name, sort) SELECT ?, name, sort FROM item WHERE room_id = ?',
        r.lastInsertRowId,
        room.id,
      );
    }
  });
  return id;
}

export function getInspection(db: SQLiteDatabase, id: number): Promise<Inspection | null> {
  return db.getFirstAsync<Inspection>('SELECT * FROM inspection WHERE id = ?', id);
}

export function listInspections(db: SQLiteDatabase): Promise<Inspection[]> {
  return db.getAllAsync<Inspection>('SELECT * FROM inspection ORDER BY started_at DESC, id DESC');
}

/** Locks the inspection. Throws InspectionLockedError if it is already finished. */
export async function finishInspection(db: SQLiteDatabase, id: number): Promise<void> {
  await assertEditable(db, 'inspection', id);
  await db.runAsync('UPDATE inspection SET finished_at = ? WHERE id = ?', Date.now(), id);
}

export async function deleteInspection(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM inspection WHERE id = ?', id);
}

// Rooms

export async function addRoom(db: SQLiteDatabase, inspectionId: number, name: string): Promise<number> {
  await assertEditable(db, 'inspection', inspectionId);
  const r = await db.runAsync(
    'INSERT INTO room (inspection_id, name, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM room WHERE inspection_id = ?))',
    inspectionId,
    name,
    inspectionId,
  );
  return r.lastInsertRowId;
}

export function listRooms(db: SQLiteDatabase, inspectionId: number): Promise<Room[]> {
  return db.getAllAsync<Room>('SELECT * FROM room WHERE inspection_id = ? ORDER BY sort', inspectionId);
}

export function getRoom(db: SQLiteDatabase, roomId: number): Promise<Room | null> {
  return db.getFirstAsync<Room>('SELECT * FROM room WHERE id = ?', roomId);
}

export async function renameRoom(db: SQLiteDatabase, roomId: number, name: string): Promise<void> {
  await assertEditable(db, 'room', roomId);
  await db.runAsync('UPDATE room SET name = ? WHERE id = ?', name, roomId);
}

export async function deleteRoom(db: SQLiteDatabase, roomId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await assertEditable(db, 'room', roomId);
    const room = await db.getFirstAsync<Room>('SELECT * FROM room WHERE id = ?', roomId);
    if (!room) return;
    await db.runAsync('DELETE FROM room WHERE id = ?', roomId);
    await db.runAsync(
      'UPDATE room SET sort = sort - 1 WHERE inspection_id = ? AND sort > ?',
      room.inspection_id,
      room.sort,
    );
  });
}

/** Swaps the room with its neighbor. Moving past either end is a no-op. */
export async function moveRoom(db: SQLiteDatabase, roomId: number, direction: 'up' | 'down'): Promise<void> {
  await db.withTransactionAsync(async () => {
    await assertEditable(db, 'room', roomId);
    const room = await db.getFirstAsync<Room>('SELECT * FROM room WHERE id = ?', roomId);
    if (!room) return;
    const target = room.sort + (direction === 'up' ? -1 : 1);
    const other = await db.getFirstAsync<Room>(
      'SELECT * FROM room WHERE inspection_id = ? AND sort = ?',
      room.inspection_id,
      target,
    );
    if (!other) return;
    await db.runAsync('UPDATE room SET sort = ? WHERE id = ?', room.sort, other.id);
    await db.runAsync('UPDATE room SET sort = ? WHERE id = ?', target, room.id);
  });
}

// Items

export async function addItem(db: SQLiteDatabase, roomId: number, name: string): Promise<number> {
  await assertEditable(db, 'room', roomId);
  const r = await db.runAsync(
    'INSERT INTO item (room_id, name, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM item WHERE room_id = ?))',
    roomId,
    name,
    roomId,
  );
  return r.lastInsertRowId;
}

export function getItem(db: SQLiteDatabase, itemId: number): Promise<Item | null> {
  return db.getFirstAsync<Item>('SELECT * FROM item WHERE id = ?', itemId);
}

export function listItems(db: SQLiteDatabase, roomId: number): Promise<Item[]> {
  return db.getAllAsync<Item>('SELECT * FROM item WHERE room_id = ? ORDER BY sort', roomId);
}

/** All items of an inspection in one query, ordered by room then item. */
export function listInspectionItems(db: SQLiteDatabase, inspectionId: number): Promise<Item[]> {
  return db.getAllAsync<Item>(
    'SELECT it.* FROM item it JOIN room r ON r.id = it.room_id WHERE r.inspection_id = ? ORDER BY r.sort, it.sort',
    inspectionId,
  );
}

export async function renameItem(db: SQLiteDatabase, itemId: number, name: string): Promise<void> {
  await assertEditable(db, 'item', itemId);
  await db.runAsync('UPDATE item SET name = ? WHERE id = ?', name, itemId);
}

export async function deleteItem(db: SQLiteDatabase, itemId: number): Promise<void> {
  await assertEditable(db, 'item', itemId);
  await db.runAsync('DELETE FROM item WHERE id = ?', itemId);
}

export async function setCondition(db: SQLiteDatabase, itemId: number, condition: Condition | null): Promise<void> {
  await assertEditable(db, 'item', itemId);
  await db.runAsync('UPDATE item SET condition = ? WHERE id = ?', condition, itemId);
}

export async function setNote(db: SQLiteDatabase, itemId: number, note: string | null): Promise<void> {
  await assertEditable(db, 'item', itemId);
  await db.runAsync('UPDATE item SET note = ? WHERE id = ?', note, itemId);
}

// Photos

export async function insertPhoto(db: SQLiteDatabase, photo: Omit<Photo, 'id'>): Promise<number> {
  await assertEditable(db, 'item', photo.item_id);
  const r = await db.runAsync(
    'INSERT INTO photo (item_id, file_uri, sha256, captured_at, width, height, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
    photo.item_id,
    photo.file_uri,
    photo.sha256,
    photo.captured_at,
    photo.width,
    photo.height,
    photo.source,
  );
  return r.lastInsertRowId;
}

export function listPhotos(db: SQLiteDatabase, itemId: number): Promise<Photo[]> {
  return db.getAllAsync<Photo>('SELECT * FROM photo WHERE item_id = ? ORDER BY captured_at, id', itemId);
}

/** Photo count per item of a room, keyed by item id. Items without photos are absent. */
export async function countPhotosByItem(db: SQLiteDatabase, roomId: number): Promise<Map<number, number>> {
  const rows = await db.getAllAsync<{ item_id: number; n: number }>(
    'SELECT p.item_id, COUNT(*) AS n FROM photo p JOIN item it ON it.id = p.item_id WHERE it.room_id = ? GROUP BY p.item_id',
    roomId,
  );
  return new Map(rows.map((r) => [r.item_id, r.n]));
}

/** All photos of an inspection in one query, ordered by room, item, then capture time. */
export function listInspectionPhotos(db: SQLiteDatabase, inspectionId: number): Promise<Photo[]> {
  return db.getAllAsync<Photo>(
    `SELECT p.* FROM photo p JOIN item it ON it.id = p.item_id JOIN room r ON r.id = it.room_id
     WHERE r.inspection_id = ? ORDER BY r.sort, it.sort, p.captured_at, p.id`,
    inspectionId,
  );
}

// Settings

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM setting WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
