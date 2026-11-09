import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { migrate } from './migrations';

let dbPromise: Promise<SQLiteDatabase> | null = null;

async function open(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync('unscratched.db');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await migrate(db);
  return db;
}

export function getDb(): Promise<SQLiteDatabase> {
  dbPromise ??= open().catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}
