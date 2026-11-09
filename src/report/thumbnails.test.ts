import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Photo } from '@/db/types';

import { buildThumbnails } from './thumbnails';

const mockDeleted: string[] = [];

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    delete() {
      mockDeleted.push(this.uri);
    }
  }
  return { File, Paths: { document: { uri: 'file:///docs' } } };
});

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn() },
}));

const mockResize = jest.fn();
const mockSave = jest.fn();
const events: string[] = [];

// Each photo (keyed by its source uri) has a size, and optionally fails to decode.
const sizes: Record<string, [number, number] | 'fail'> = {};

function photo(id: number, width: number, height: number): Photo {
  const file_uri = `photos/${id}.jpg`;
  sizes[`file:///docs/${file_uri}`] = [width, height];
  return { id, item_id: 1, file_uri, sha256: 'x', captured_at: 0, width, height, source: 'camera' };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleted.length = 0;
  events.length = 0;
  for (const k of Object.keys(sizes)) delete sizes[k];
  jest.mocked(ImageManipulator.manipulate).mockImplementation(((src: unknown) => {
    const uri = typeof src === 'string' ? src : '';
    const image = (w: number, h: number, id: string) => ({
      width: w,
      height: h,
      saveAsync: (opts: unknown) => {
        mockSave(opts);
        return Promise.resolve({ uri: `file:///cache/${id}.jpg`, width: w, height: h, base64: `b64-${id}` });
      },
    });
    if (typeof src === 'string') {
      events.push(`start ${uri}`);
      return {
        renderAsync: async () => {
          await Promise.resolve();
          const s = sizes[uri];
          if (s === 'fail' || !s) throw new Error('decode');
          events.push(`end ${uri}`);
          return image(s[0], s[1], uri.split('/').pop()!);
        },
      };
    }
    const orig = src as { width: number; height: number };
    return {
      resize: (size: { width?: number; height?: number }) => {
        mockResize(size);
        const w = size.width ?? Math.round((orig.width * size.height!) / orig.height);
        const h = size.height ?? Math.round((orig.height * size.width!) / orig.width);
        return { renderAsync: () => Promise.resolve(image(w, h, 'r')) };
      },
    };
  }) as never);
});

test('landscape and portrait resize to 800 on the long edge, JPEG 0.6 with base64', async () => {
  const out = await buildThumbnails([photo(1, 4000, 3000), photo(2, 3000, 4000)]);

  expect(mockResize).toHaveBeenNthCalledWith(1, { width: 800 });
  expect(mockResize).toHaveBeenNthCalledWith(2, { height: 800 });
  expect(mockSave).toHaveBeenCalledWith({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  expect(Object.keys(out)).toEqual(['1', '2']);
});

test('values are base64 JPEG data URIs keyed by photo id, and temp files are deleted', async () => {
  const out = await buildThumbnails([photo(5, 2000, 1000)]);

  expect(out[5]).toBe('data:image/jpeg;base64,b64-r');
  expect(mockDeleted).toEqual(['file:///cache/r.jpg']);
});

test('a photo already within 800px is not upscaled', async () => {
  const out = await buildThumbnails([photo(3, 600, 400)]);

  expect(mockResize).not.toHaveBeenCalled();
  expect(out[3]).toMatch(/^data:image\/jpeg;base64,/);
});

test('photos are processed sequentially', async () => {
  await buildThumbnails([photo(1, 100, 100), photo(2, 100, 100)]);

  expect(events).toEqual([
    'start file:///docs/photos/1.jpg',
    'end file:///docs/photos/1.jpg',
    'start file:///docs/photos/2.jpg',
    'end file:///docs/photos/2.jpg',
  ]);
});

test('a failing photo is skipped and the others still succeed', async () => {
  const a = photo(1, 100, 100);
  const bad = photo(2, 100, 100);
  const c = photo(3, 100, 100);
  sizes['file:///docs/photos/2.jpg'] = 'fail';

  const out = await buildThumbnails([a, bad, c]);

  expect(Object.keys(out)).toEqual(['1', '3']);
  expect(out[2]).toBeUndefined();
});
