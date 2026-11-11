import type { SQLiteDatabase } from 'expo-sqlite';

import { listInspectionPhotos, listReceipts } from '@/db/repo';

import { receiptsConfig } from './config';
import { manifestHash } from './manifest';
import { TIMEOUT_MS } from './queue';

export type Acknowledgement = { name: string; at: number };

/** The inspection's manifest hash once the server has a receipt for it (only then can a landlord acknowledge it). */
export async function receiptedManifest(db: SQLiteDatabase, inspectionId: number): Promise<string | null> {
  const [photos, receipts] = await Promise.all([listInspectionPhotos(db, inspectionId), listReceipts(db)]);
  const manifest = await manifestHash(photos.map((p) => p.sha256));
  return manifest && manifest in receipts ? manifest : null;
}

/** The full hash goes in the link, so nobody can acknowledge a report by guessing its short code. */
export const acknowledgeLink = (manifest: string) => `https://unscratched.app/a/${manifest}`;

/** Acknowledgements for one manifest, oldest first. Never rejects: [] when offline, unconfigured, or on any error. */
export async function fetchAcknowledgements(manifest: string): Promise<Acknowledgement[]> {
  const config = receiptsConfig();
  if (!config) return [];
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    // Privacy: only the manifest hash is sent.
    const res = await fetch(`${config.url}/rest/v1/rpc/lookup_acknowledgements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
      body: JSON.stringify({ p_hash: manifest }),
      signal: abort.signal,
    });
    if (!res.ok) return [];
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((r: { landlord_name?: unknown; acknowledged_at?: unknown }) => {
      const at = typeof r?.acknowledged_at === 'string' ? Date.parse(r.acknowledged_at) : NaN;
      return typeof r?.landlord_name === 'string' && !Number.isNaN(at) ? [{ name: r.landlord_name, at }] : [];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
