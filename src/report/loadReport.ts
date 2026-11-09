import type { SQLiteDatabase } from 'expo-sqlite';

import { getInspection, listInspectionItems, listInspectionPhotos, listRooms } from '@/db/repo';

import { buildThumbnails } from './thumbnails';
import type { Acknowledgement, ReportData } from './types';

/** Reads the inspection with its rooms, items, and photos (4 queries total) and builds the photo thumbnails. */
export async function loadReportData(
  db: SQLiteDatabase,
  inspectionId: number,
  acknowledgement: Acknowledgement | null,
): Promise<ReportData> {
  const inspection = await getInspection(db, inspectionId);
  if (!inspection) throw new Error(`Inspection ${inspectionId} not found`);
  const [rooms, items, photos] = await Promise.all([
    listRooms(db, inspectionId),
    listInspectionItems(db, inspectionId),
    listInspectionPhotos(db, inspectionId),
  ]);
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
  };
}
