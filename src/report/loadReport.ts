import type { SQLiteDatabase } from 'expo-sqlite';

import { getInspection, listInspectionItems, listInspectionPhotos, listReceipts, listRooms } from '@/db/repo';
import { manifestHash, verificationCode } from '@/receipts/manifest';

import { buildThumbnails } from './thumbnails';
import type { Acknowledgement, ReportData } from './types';

/** Reads the inspection with its rooms, items, photos, and receipts (5 queries total) and builds the photo thumbnails. */
export async function loadReportData(
  db: SQLiteDatabase,
  inspectionId: number,
  acknowledgement: Acknowledgement | null,
): Promise<ReportData> {
  const inspection = await getInspection(db, inspectionId);
  if (!inspection) throw new Error(`Inspection ${inspectionId} not found`);
  const [rooms, items, photos, receipts] = await Promise.all([
    listRooms(db, inspectionId),
    listInspectionItems(db, inspectionId),
    listInspectionPhotos(db, inspectionId),
    listReceipts(db),
  ]);
  const manifest = await manifestHash(photos.map((p) => p.sha256));
  return {
    inspection,
    rooms: rooms.map((room) => ({
      room,
      items: items
        .filter((item) => item.room_id === room.id)
        .map((item) => ({ item, photos: photos.filter((p) => p.item_id === item.id) })),
    })),
    thumbnails: await buildThumbnails(photos),
    acknowledgement,
    generatedAt: Date.now(),
    receipts,
    verificationCode: manifest && manifest in receipts ? verificationCode(manifest) : null,
  };
}
