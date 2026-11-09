import type { SQLiteDatabase } from 'expo-sqlite';

import { listFinishedPhotoHashes, listReceipts, saveReceipts } from '@/db/repo';
import type { Receipt } from '@/db/types';

import { receiptsConfig } from './config';
import { manifestHash } from './manifest';

export const BATCH_SIZE = 500;
export const TIMEOUT_MS = 10_000;
const HEX64 = /^[0-9a-f]{64}$/;

/** Hashes of finished inspections (photos plus each inspection's manifest) that have no stored receipt. */
export async function pendingHashes(db: SQLiteDatabase): Promise<string[]> {
  const [rows, receipts] = await Promise.all([listFinishedPhotoHashes(db), listReceipts(db)]);
  const byInspection = new Map<number, string[]>();
  for (const { inspection_id, sha256 } of rows) byInspection.set(inspection_id, [...(byInspection.get(inspection_id) ?? []), sha256]);
  const manifests = await Promise.all([...byInspection.values()].map(manifestHash));
  const all = new Set([...rows.map((r) => r.sha256), ...manifests].filter((h): h is string => h != null && HEX64.test(h)));
  return [...all].filter((h) => !(h in receipts));
}

/** Parses the function's response, keeping only well-formed receipts for hashes we sent. */
function parseReceipts(body: unknown, sent: Set<string>): Receipt[] {
  const list = (body as { receipts?: unknown } | null)?.receipts;
  if (!Array.isArray(list)) return [];
  return list.flatMap((r: { sha256?: unknown; receipt_id?: unknown; server_time?: unknown }) => {
    const time = typeof r?.server_time === 'string' ? Date.parse(r.server_time) : NaN;
    return typeof r?.sha256 === 'string' && sent.has(r.sha256) && typeof r.receipt_id === 'string' && !Number.isNaN(time)
      ? [{ sha256: r.sha256, receipt_id: r.receipt_id, server_time: time }]
      : [];
  });
}

async function run(db: SQLiteDatabase): Promise<void> {
  const config = receiptsConfig();
  if (!config) return;
  const pending = await pendingHashes(db);
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const hashes = pending.slice(i, i + BATCH_SIZE);
    // Privacy: the body is only SHA-256 hex strings. Never add anything else here.
    // Exports wait for a sync, so a stalled network must not hold them up for the OS default timeout.
    // (React Native's AbortSignal polyfill has no AbortSignal.timeout.)
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    const res = await fetch(`${config.url}/functions/v1/issue-receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
      body: JSON.stringify({ hashes }),
      signal: abort.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return;
    await saveReceipts(db, parseReceipts(await res.json(), new Set(hashes)));
  }
}

let current: Promise<void> | null = null;
let queued: Promise<void> | null = null;

/**
 * Sends every pending hash and stores the receipts. Never rejects: on any failure the hashes stay pending for the
 * next call. Calls made while a sync runs share one follow-up sync, so hashes finished mid-sync are not missed.
 */
export function syncReceipts(db: SQLiteDatabase): Promise<void> {
  if (!current) {
    current = run(db)
      .catch(() => {})
      .finally(() => {
        current = null;
      });
    return current;
  }
  queued ??= current.then(() => {
    queued = null;
    return syncReceipts(db);
  });
  return queued;
}
