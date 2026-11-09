import * as Sharing from 'expo-sharing';
import { strFromU8, unzipSync } from 'fflate';

import * as repo from '@/db/repo';

import { exportPhotosZip } from './exportPhotosZip';

const mockFiles = new Map<string, Uint8Array>();
const mockWrites = new Map<string, Uint8Array>();

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    async bytes() {
      const b = mockFiles.get(this.uri);
      if (!b) throw new Error(`missing ${this.uri}`);
      return b;
    }
    async write(content: Uint8Array) {
      mockWrites.set(this.uri, content);
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache' }, document: { uri: 'file:///doc' } } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-print', () => ({}));
jest.mock('@/db/repo');
jest.mock('@/lib/photos', () => ({ photoUri: (p: { file_uri: string }) => `file:///doc/${p.file_uri}` }));

const db = {} as never;
const t0 = Date.UTC(2026, 0, 20, 15, 30);
const photo = (id: number, itemId: number) => ({
  id, item_id: itemId, file_uri: `photos/${id}.jpg`, sha256: `hash${id}`, captured_at: t0 + id * 1000,
  width: 1600, height: 1200, source: 'camera' as const,
});

function setup(photos: ReturnType<typeof photo>[]) {
  jest.mocked(repo.getInspection).mockResolvedValue({ id: 7, kind: 'move_in', address: '12 Main St' } as never);
  jest.mocked(repo.listRooms).mockResolvedValue([
    { id: 1, inspection_id: 7, name: 'Kitchen', sort: 0 },
    { id: 2, inspection_id: 7, name: 'Bed/room "2", up', sort: 1 },
  ]);
  jest.mocked(repo.listInspectionItems).mockResolvedValue([
    { id: 10, room_id: 1, name: 'Sink', condition: null, note: null, sort: 0 },
    { id: 11, room_id: 1, name: 'Oven', condition: null, note: null, sort: 1 },
    { id: 20, room_id: 2, name: '../Window "A"', condition: null, note: null, sort: 0 },
  ]);
  jest.mocked(repo.listInspectionPhotos).mockResolvedValue(photos);
  for (const p of photos) mockFiles.set(`file:///doc/${p.file_uri}`, new Uint8Array([p.id, 0xff, 0xd8]));
}

function unzipWritten() {
  expect(mockWrites.size).toBe(1);
  const [[uri, bytes]] = [...mockWrites];
  return { uri, files: unzipSync(bytes) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockWrites.clear();
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
});

test('zips every photo under room/item paths with a matching manifest, then shares it as a zip', async () => {
  setup([photo(1, 10), photo(2, 10), photo(3, 11), photo(4, 20)]);
  const uriPattern = /^file:\/\/\/cache\/Unscratched-move-in-12-main-st-\d{4}-\d{2}-\d{2}-photos\.zip$/;

  const result = await exportPhotosZip(db, 7);
  const { uri, files } = unzipWritten();
  expect(result).toBe(uri);
  expect(uri).toMatch(uriPattern);

  expect(Object.keys(files).sort()).toEqual([
    'bed-room-2-up/window-a-1.jpg',
    'kitchen/oven-1.jpg',
    'kitchen/sink-1.jpg',
    'kitchen/sink-2.jpg',
    'manifest.csv',
  ]);
  expect(files['kitchen/sink-2.jpg']).toEqual(new Uint8Array([2, 0xff, 0xd8]));
  expect(files['bed-room-2-up/window-a-1.jpg']).toEqual(new Uint8Array([4, 0xff, 0xd8]));

  const rows = strFromU8(files['manifest.csv']).trimEnd().split('\r\n');
  expect(rows).toEqual([
    'room,item,file,captured_at_iso,sha256',
    `Kitchen,Sink,kitchen/sink-1.jpg,${new Date(t0 + 1000).toISOString()},hash1`,
    `Kitchen,Sink,kitchen/sink-2.jpg,${new Date(t0 + 2000).toISOString()},hash2`,
    `Kitchen,Oven,kitchen/oven-1.jpg,${new Date(t0 + 3000).toISOString()},hash3`,
    `"Bed/room ""2"", up","../Window ""A""",bed-room-2-up/window-a-1.jpg,${new Date(t0 + 4000).toISOString()},hash4`,
  ]);

  expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle: 'Share full-resolution photos',
  });
});

test('items whose names slug to the same path keep every photo', async () => {
  setup([photo(1, 10)]);
  jest.mocked(repo.listInspectionItems).mockResolvedValue([
    { id: 10, room_id: 1, name: 'Sink', condition: null, note: null, sort: 0 },
    { id: 12, room_id: 1, name: 'SINK!', condition: null, note: null, sort: 1 },
  ]);
  jest.mocked(repo.listInspectionPhotos).mockResolvedValue([photo(1, 10), photo(5, 12)]);
  mockFiles.set('file:///doc/photos/5.jpg', new Uint8Array([5]));
  await exportPhotosZip(db, 7);
  expect(Object.keys(unzipWritten().files).sort()).toEqual(['kitchen/sink-1.jpg', 'kitchen/sink-2.jpg', 'manifest.csv']);
});

test('throws a clear error and shares nothing when there are no photos', async () => {
  setup([]);
  await expect(exportPhotosZip(db, 7)).rejects.toThrow('This inspection has no photos to export.');
  expect(mockWrites.size).toBe(0);
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('throws a clear error when sharing is unavailable', async () => {
  setup([photo(1, 10)]);
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  await expect(exportPhotosZip(db, 7)).rejects.toThrow('Sharing is not available on this device.');
  expect(mockWrites.size).toBe(0);
});
