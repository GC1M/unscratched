import type { SQLiteDatabase } from 'expo-sqlite';

import type { InspectionKind, Item } from '@/db/types';

/**
 * The move-in item that matches a move-out item: in the linked move-in inspection, the room
 * with the same name (same sort preferred), then the item with the same name (same sort preferred).
 */
export async function findMoveInItem(db: SQLiteDatabase, itemId: number): Promise<Item | null> {
  const src = await db.getFirstAsync<{
    name: string;
    sort: number;
    room_name: string;
    room_sort: number;
    kind: InspectionKind;
    linked_move_in_id: number | null;
  }>(
    `SELECT it.name, it.sort, r.name AS room_name, r.sort AS room_sort, i.kind, i.linked_move_in_id
     FROM item it JOIN room r ON r.id = it.room_id JOIN inspection i ON i.id = r.inspection_id
     WHERE it.id = ?`,
    itemId,
  );
  if (!src || src.kind !== 'move_out' || src.linked_move_in_id == null) return null;

  const room = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM room WHERE inspection_id = ? AND name = ? ORDER BY sort = ? DESC, sort LIMIT 1',
    src.linked_move_in_id,
    src.room_name,
    src.room_sort,
  );
  if (!room) return null;
  return db.getFirstAsync<Item>(
    'SELECT * FROM item WHERE room_id = ? AND name = ? ORDER BY sort = ? DESC, sort LIMIT 1',
    room.id,
    src.name,
    src.sort,
  );
}
