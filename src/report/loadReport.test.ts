import { createHash } from 'crypto';

import * as repo from '@/db/repo';
import type { Item, Photo, Room } from '@/db/types';

import { loadReportData } from './loadReport';
import { buildThumbnails } from './thumbnails';

jest.mock('@/db/repo');
jest.mock('./thumbnails', () => ({ buildThumbnails: jest.fn() }));
const mockCreateHash = createHash;
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_alg: string, data: string) => mockCreateHash('sha256').update(data).digest('hex'),
}));

const r = jest.mocked(repo);
const db = {} as never;

const room = (id: number, sort: number): Room => ({ id, inspection_id: 1, name: `R${id}`, sort });
const item = (id: number, room_id: number, sort: number): Item => ({ id, room_id, name: `I${id}`, condition: null, note: null, sort });
const photo = (id: number, item_id: number): Photo => ({
  id, item_id, file_uri: `p${id}`, sha256: 's', captured_at: id, width: 1, height: 1, source: 'camera',
});

test('groups items and photos under their rooms in order and passes thumbnails through', async () => {
  const inspection = { id: 1, address: '1 Main St', finished_at: 5 } as never;
  const photos = [photo(100, 20), photo(101, 21), photo(102, 21), photo(103, 10)];
  r.getInspection.mockResolvedValue(inspection);
  r.listRooms.mockResolvedValue([room(2, 0), room(1, 1)]);
  r.listInspectionItems.mockResolvedValue([item(20, 2, 0), item(21, 2, 1), item(10, 1, 0), item(11, 1, 1)]);
  r.listInspectionPhotos.mockResolvedValue(photos);
  r.listReceipts.mockResolvedValue({ s: 9 });
  const thumbs = { 100: 'data:a', 102: 'data:b' };
  jest.mocked(buildThumbnails).mockResolvedValue(thumbs);
  jest.spyOn(Date, 'now').mockReturnValue(777);
  const ack = { tenantName: 'Ana', landlordName: null, date: 5 };

  const data = await loadReportData(db, 1, ack);

  expect(buildThumbnails).toHaveBeenCalledWith(photos);
  expect(data.inspection).toBe(inspection);
  expect(data.thumbnails).toBe(thumbs);
  expect(data.acknowledgement).toBe(ack);
  expect(data.generatedAt).toBe(777);
  expect(data.receipts).toEqual({ s: 9 });
  expect(data.verificationCode).toBeNull(); // the manifest has no receipt yet
  expect(
    data.rooms.map((rr) => [rr.room.id, rr.items.map((ri) => [ri.item.id, ri.photos.map((p) => p.id)])]),
  ).toEqual([
    [2, [[20, [100]], [21, [101, 102]]]],
    [1, [[10, [103]], [11, []]]],
  ]);
});

test('throws when the inspection does not exist', async () => {
  r.getInspection.mockResolvedValue(null);
  await expect(loadReportData(db, 9, null)).rejects.toThrow('not found');
});

test('verificationCode is the manifest prefix once the manifest has a receipt, null without photos', async () => {
  const hashes = ['b'.repeat(64), 'a'.repeat(64)];
  const manifest = createHash('sha256').update(`${'a'.repeat(64)}\n${'b'.repeat(64)}`).digest('hex');
  r.getInspection.mockResolvedValue({ id: 1 } as never);
  r.listRooms.mockResolvedValue([room(1, 0)]);
  r.listInspectionItems.mockResolvedValue([item(10, 1, 0)]);
  r.listInspectionPhotos.mockResolvedValue(hashes.map((sha256, i) => ({ ...photo(i, 10), sha256 })));
  r.listReceipts.mockResolvedValue({ [manifest]: 5 });
  jest.mocked(buildThumbnails).mockResolvedValue({});
  expect((await loadReportData(db, 1, null)).verificationCode).toBe(manifest.slice(0, 12));

  r.listInspectionPhotos.mockResolvedValue([]);
  expect((await loadReportData(db, 1, null)).verificationCode).toBeNull();
});
