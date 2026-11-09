import { CryptoDigestAlgorithm, digest, randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { SQLiteDatabase } from 'expo-sqlite';

import { insertPhoto } from '@/db/repo';
import type { Photo } from '@/db/types';

const LONG_EDGE = 1600;
const PHOTO_DIR = 'photos';

// file_uri is stored relative to the documents directory, because iOS can move the app
// container (and its absolute path) on updates and restores.
export function photoUri(photo: Pick<Photo, 'file_uri'>): string {
  return new File(Paths.document, photo.file_uri).uri;
}

// Resize to 1600px on the long edge (never upscale), save as JPEG 0.7, move it into
// documents/photos, hash the file bytes, and insert the photo row.
export async function capturePhoto(db: SQLiteDatabase, itemId: number, sourceUri: string): Promise<Photo> {
  const original = await ImageManipulator.manipulate(sourceUri).renderAsync();
  let image = original;
  if (Math.max(original.width, original.height) > LONG_EDGE) {
    const size = original.width >= original.height ? { width: LONG_EDGE } : { height: LONG_EDGE };
    image = await ImageManipulator.manipulate(original).resize(size).renderAsync();
  }
  const result = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });

  const dir = new Directory(Paths.document, PHOTO_DIR);
  dir.create({ idempotent: true, intermediates: true });
  const name = `${PHOTO_DIR}/${randomUUID()}.jpg`;
  const file = new File(Paths.document, name);
  await new File(result.uri).move(file);

  try {
    const hash = await digest(CryptoDigestAlgorithm.SHA256, await file.bytes());
    const photo: Omit<Photo, 'id'> = {
      item_id: itemId,
      file_uri: name,
      sha256: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join(''),
      captured_at: Date.now(),
      width: result.width,
      height: result.height,
      source: 'camera',
    };
    const id = await insertPhoto(db, photo);
    return { id, ...photo };
  } catch (e) {
    file.delete();
    throw e;
  }
}
