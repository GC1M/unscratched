import type { SQLiteDatabase } from 'expo-sqlite';

// Append only. Never edit a migration that has shipped; add a new one instead.
export const migrations: string[] = [
  `
  CREATE TABLE inspection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    unit TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('move_in', 'move_out')),
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    tenant_name TEXT,
    landlord_name TEXT,
    linked_move_in_id INTEGER REFERENCES inspection(id) ON DELETE SET NULL,
    move_out_date INTEGER
  );
  CREATE TABLE room (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL REFERENCES inspection(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL
  );
  CREATE INDEX room_inspection ON room(inspection_id, sort);
  CREATE TABLE item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL REFERENCES room(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    condition TEXT CHECK (condition IN ('good', 'fair', 'damaged')),
    note TEXT,
    sort INTEGER NOT NULL
  );
  CREATE INDEX item_room ON item(room_id, sort);
  CREATE TABLE photo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
    file_uri TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source = 'camera')
  );
  CREATE INDEX photo_item ON photo(item_id);
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < migrations.length; v++) {
    const sql = migrations[v];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
