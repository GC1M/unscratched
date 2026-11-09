import type { SQLiteDatabase } from 'expo-sqlite';

import { expandTemplate } from '../templates/rooms';

import type { Condition, Inspection, InspectionKind, Item, Photo, Room } from './types';

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

export function getInspection(db: SQLiteDatabase, id: number): Promise<Inspection | null> {
  return db.getFirstAsync<Inspection>('SELECT * FROM inspection WHERE id = ?', id);
}

export function listInspections(db: SQLiteDatabase): Promise<Inspection[]> {
  return db.getAllAsync<Inspection>('SELECT * FROM inspection ORDER BY started_at DESC, id DESC');
}

export async function deleteInspection(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM inspection WHERE id = ?', id);
}

// Rooms

export async function addRoom(db: SQLiteDatabase, inspectionId: number, name: string): Promise<number> {
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

export async function renameRoom(db: SQLiteDatabase, roomId: number, name: string): Promise<void> {
  await db.runAsync('UPDATE room SET name = ? WHERE id = ?', name, roomId);
}

export async function deleteRoom(db: SQLiteDatabase, roomId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
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

export async function renameItem(db: SQLiteDatabase, itemId: number, name: string): Promise<void> {
  await db.runAsync('UPDATE item SET name = ? WHERE id = ?', name, itemId);
}

export async function deleteItem(db: SQLiteDatabase, itemId: number): Promise<void> {
  await db.runAsync('DELETE FROM item WHERE id = ?', itemId);
}

export async function setCondition(db: SQLiteDatabase, itemId: number, condition: Condition | null): Promise<void> {
  await db.runAsync('UPDATE item SET condition = ? WHERE id = ?', condition, itemId);
}

export async function setNote(db: SQLiteDatabase, itemId: number, note: string | null): Promise<void> {
  await db.runAsync('UPDATE item SET note = ? WHERE id = ?', note, itemId);
}

// Photos

export async function insertPhoto(db: SQLiteDatabase, photo: Omit<Photo, 'id'>): Promise<number> {
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
