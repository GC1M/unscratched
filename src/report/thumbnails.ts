import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Photo } from '@/db/types';
import { photoUri } from '@/lib/photos';

const LONG_EDGE = 800;

// Resize each photo to an 800px long edge (never upscale) as a base64 JPEG data URI, keyed by
// photo id. One photo at a time to bound memory. A photo that fails is skipped (no entry), so the
// report renders a "photo unavailable" box for it instead of failing the whole export.
export async function buildThumbnails(photos: Photo[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (const photo of photos) {
    try {
      const original = await ImageManipulator.manipulate(photoUri(photo)).renderAsync();
      let image = original;
      if (Math.max(original.width, original.height) > LONG_EDGE) {
        const size = original.width >= original.height ? { width: LONG_EDGE } : { height: LONG_EDGE };
        image = await ImageManipulator.manipulate(original).resize(size).renderAsync();
      }
      const result = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
      new File(result.uri).delete();
      if (result.base64) out[photo.id] = `data:image/jpeg;base64,${result.base64}`;
    } catch {
      // skipped on purpose
    }
  }
  return out;
}
