import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSetting } from '@/db/repo';
import type { Condition, Photo } from '@/db/types';
import { photoUri } from '@/lib/photos';
import { receiptsConfig } from '@/receipts/config';

/** Setting key for the opt-in toggle; '1' means on. Off (missing) by default. */
export const SUGGEST_SETTING = 'suggest_notes';
const INSTALL_SETTING = 'install_id';
const LONG_EDGE = 768;
const TIMEOUT_MS = 10_000;

export type Severity = 'none' | 'minor' | 'major';
export type Suggestion = { caption: string; severity: Severity };

const CONDITION: Record<Severity, Condition> = { none: 'good', minor: 'fair', major: 'damaged' };
export const toCondition = (severity: Severity): Condition => CONDITION[severity];

/** A random id made once per install, used only for the server's daily rate limit. */
async function installId(db: SQLiteDatabase): Promise<string> {
  const saved = await getSetting(db, INSTALL_SETTING);
  if (saved) return saved;
  const id = randomUUID().toLowerCase();
  await setSetting(db, INSTALL_SETTING, id);
  return id;
}

/**
 * Sends a 768px JPEG copy of one photo to the suggest-note function and returns its caption and severity.
 * Only call this when the user turned the setting on and tapped Suggest note. Throws on any failure.
 */
export async function suggestNote(db: SQLiteDatabase, photo: Photo): Promise<Suggestion> {
  const config = receiptsConfig();
  if (!config) throw new Error('Suggestions are not available in this build.');
  let edit = ImageManipulator.manipulate(photoUri(photo));
  if (Math.max(photo.width, photo.height) > LONG_EDGE) {
    edit = edit.resize(photo.width >= photo.height ? { width: LONG_EDGE } : { height: LONG_EDGE });
  }
  const small = await (await edit.renderAsync()).saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  // The base64 is all we need; drop the temporary file right away.
  new File(small.uri).delete();

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  const res = await fetch(`${config.url}/functions/v1/suggest-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
    body: JSON.stringify({ install_id: await installId(db), image: small.base64 }),
    signal: abort.signal,
  })
    .catch(() => {
      throw new Error('Could not reach the server. Check your connection.');
    })
    .finally(() => clearTimeout(timer));
  if (res.status === 429) throw new Error('Daily limit reached. Try again tomorrow.');
  if (!res.ok) throw new Error('Could not get a suggestion.');
  const body = (await res.json()) as { caption?: unknown; severity?: unknown };
  if (typeof body.caption !== 'string' || !body.caption || !(['none', 'minor', 'major'] as unknown[]).includes(body.severity)) {
    throw new Error('Could not get a suggestion.');
  }
  return { caption: body.caption, severity: body.severity as Severity };
}
