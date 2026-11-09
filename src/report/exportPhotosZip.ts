import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { strToU8, zipSync, type Zippable } from 'fflate';

import { getInspection, listInspectionItems, listInspectionPhotos, listRooms } from '@/db/repo';
import { photoUri } from '@/lib/photos';

import { reportFileName, slug } from './export';

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Zips every photo of the inspection as <room>/<item>-<n>.jpg plus a manifest.csv
 * (room, item, file, captured_at_iso, sha256), writes it to the cache dir, and opens
 * the share sheet. Returns the zip uri.
 */
export async function exportPhotosZip(db: SQLiteDatabase, inspectionId: number): Promise<string> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const inspection = await getInspection(db, inspectionId);
  if (!inspection) throw new Error(`Inspection ${inspectionId} not found`);
  const [rooms, items, photos] = await Promise.all([
    listRooms(db, inspectionId),
    listInspectionItems(db, inspectionId),
    listInspectionPhotos(db, inspectionId),
  ]);
  if (photos.length === 0) throw new Error('This inspection has no photos to export.');

  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const itemOf = new Map(items.map((i) => [i.id, i]));
  // ponytail: zipSync holds every photo in memory at once (40 photos at about 250 KB is
  // about 10 MB, fine). Switch to fflate's streaming Zip if photo counts grow a lot.
  const entries: Zippable = {};
  // Counted per path, so two rooms or items that slug to the same name never overwrite each other.
  const counts = new Map<string, number>();
  const manifest = ['room,item,file,captured_at_iso,sha256'];
  for (const photo of photos) {
    const item = itemOf.get(photo.item_id);
    const room = roomName.get(item?.room_id ?? -1) ?? '';
    const base = `${slug(room, 'room')}/${slug(item?.name ?? '', 'item')}`;
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    const name = `${base}-${n}.jpg`;
    // One file at a time, so only the zip input (not parallel reads) is in memory.
    entries[name] = await new File(photoUri(photo)).bytes();
    manifest.push(
      [room, item?.name ?? '', name, new Date(photo.captured_at).toISOString(), photo.sha256].map(csvField).join(','),
    );
  }
  entries['manifest.csv'] = strToU8(`${manifest.join('\r\n')}\r\n`);

  // Level 0 (store): the JPEGs are already compressed, so deflating them only burns CPU.
  const zip = new File(
    Paths.cache,
    reportFileName(inspection.kind, inspection.address, Date.now()).replace(/\.pdf$/, '-photos.zip'),
  );
  await zip.write(zipSync(entries, { level: 0 }));
  await Sharing.shareAsync(zip.uri, {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle: 'Share full-resolution photos',
  });
  return zip.uri;
}
