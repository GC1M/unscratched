import { createHash } from 'crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { SQLiteDatabase } from 'expo-sqlite';

import { insertPhoto } from '@/db/repo';

import { capturePhoto } from './photos';

// In-memory file system: uri -> bytes.
const mockFiles = new Map<string, Uint8Array>();
const mockCreateHash = createHash;
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5, 0xff, 0xd9]);

jest.mock('expo-file-system', () => {
  const join = (parts: (string | { uri: string })[]) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    async move(dest: File) {
      mockFiles.set(dest.uri, mockFiles.get(this.uri)!);
      mockFiles.delete(this.uri);
    }
    async bytes() {
      return mockFiles.get(this.uri)!;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    create = jest.fn();
  }
  return { File, Directory, Paths: { document: new Directory('file:///docs') } };
});

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: () => 'uuid-1',
  digest: async (_alg: string, data: Uint8Array) => {
    const buf = mockCreateHash('sha256').update(data).digest();
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  },
}));

const mockResize = jest.fn();
const mockSave = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn() },
}));

jest.mock('@/db/repo', () => ({ insertPhoto: jest.fn(() => Promise.resolve(42)) }));

const db = {} as SQLiteDatabase;

// Source image of the given size; the resize mock scales it like the native module would.
function source(width: number, height: number) {
  const image = (w: number, h: number) => ({
    width: w,
    height: h,
    saveAsync: (opts: unknown) => {
      mockSave(opts);
      mockFiles.set('file:///cache/out.jpg', BYTES);
      return Promise.resolve({ uri: 'file:///cache/out.jpg', width: w, height: h });
    },
  });
  jest.mocked(ImageManipulator.manipulate).mockImplementation(
    () =>
      ({
        renderAsync: () => Promise.resolve(image(width, height)),
        resize: (size: { width?: number; height?: number }) => {
          mockResize(size);
          const w = size.width ?? Math.round((width * size.height!) / height);
          const h = size.height ?? Math.round((height * size.width!) / width);
          return { renderAsync: () => Promise.resolve(image(w, h)) };
        },
      }) as never,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
});

test('landscape: resizes width to 1600, saves JPEG 0.7 into documents/photos, hashes the bytes, inserts the row', async () => {
  source(4032, 3024);
  const photo = await capturePhoto(db, 7, 'file:///camera/raw.jpg');

  expect(mockResize).toHaveBeenCalledWith({ width: 1600 });
  expect(mockSave).toHaveBeenCalledWith({ compress: 0.7, format: SaveFormat.JPEG });
  expect([...mockFiles.keys()]).toEqual(['file:///docs/photos/uuid-1.jpg']);

  const expected = createHash('sha256').update(BYTES).digest('hex');
  expect(insertPhoto).toHaveBeenCalledWith(db, {
    item_id: 7,
    file_uri: 'file:///docs/photos/uuid-1.jpg',
    sha256: expected,
    captured_at: 1_700_000_000_000,
    width: 1600,
    height: 1200,
    source: 'camera',
  });
  expect(photo).toMatchObject({ id: 42, sha256: expected, source: 'camera' });
});

test('portrait: resizes height to 1600', async () => {
  source(3024, 4032);
  const photo = await capturePhoto(db, 7, 'file:///camera/raw.jpg');
  expect(mockResize).toHaveBeenCalledWith({ height: 1600 });
  expect(photo).toMatchObject({ width: 1200, height: 1600 });
});

test('small source is not upscaled', async () => {
  source(1200, 800);
  const photo = await capturePhoto(db, 7, 'file:///camera/raw.jpg');
  expect(mockResize).not.toHaveBeenCalled();
  expect(mockSave).toHaveBeenCalledWith({ compress: 0.7, format: SaveFormat.JPEG });
  expect(photo).toMatchObject({ width: 1200, height: 800 });
});

test('failure after writing deletes the file and rethrows', async () => {
  source(4032, 3024);
  jest.mocked(insertPhoto).mockRejectedValueOnce(new Error('db down'));
  await expect(capturePhoto(db, 7, 'file:///camera/raw.jpg')).rejects.toThrow('db down');
  expect(mockFiles.size).toBe(0);
});
