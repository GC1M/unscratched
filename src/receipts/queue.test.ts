import { createHash } from 'crypto';

import type { Receipt } from '@/db/types';

import { BATCH_SIZE, pendingHashes, syncReceipts } from './queue';

const mockCreateHash = createHash;
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_alg: string, data: string) => mockCreateHash('sha256').update(data).digest('hex'),
}));

// In-memory stand-ins for the repo: finished photo rows and the receipt table (INSERT OR IGNORE semantics).
let mockRows: { inspection_id: number; sha256: string }[] = [];
const mockStore = new Map<string, Receipt>();
jest.mock('@/db/repo', () => ({
  listFinishedPhotoHashes: async () => mockRows,
  listReceipts: async () => Object.fromEntries([...mockStore.values()].map((r) => [r.sha256, r.server_time])),
  saveReceipts: async (_db: unknown, rs: Receipt[]) => rs.forEach((r) => mockStore.has(r.sha256) || mockStore.set(r.sha256, r)),
}));

const db = {} as never;
const hex = (n: number) => createHash('sha256').update(String(n)).digest('hex');
const manifest = (hashes: string[]) => createHash('sha256').update([...hashes].sort().join('\n')).digest('hex');
const SERVER_TIME = '2026-11-09T12:00:00.000Z';

// Fake edge function: echoes a receipt per unique hash sent.
const ok = () =>
  jest.fn(async (_url: string, init: { body: string }) => {
    const { hashes } = JSON.parse(init.body) as { hashes: string[] };
    return {
      ok: true,
      json: async () => ({ receipts: [...new Set(hashes)].map((h) => ({ sha256: h, receipt_id: `r-${h.slice(0, 4)}`, server_time: SERVER_TIME })) }),
    };
  });
const sent = (fetch: jest.Mock) => fetch.mock.calls.flatMap(([, init]) => (JSON.parse(init.body) as { hashes: string[] }).hashes);

beforeEach(() => {
  mockRows = [
    { inspection_id: 1, sha256: hex(1) },
    { inspection_id: 1, sha256: hex(2) },
    { inspection_id: 2, sha256: hex(3) },
  ];
  mockStore.clear();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co/';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

afterEach(() => {
  delete (global as { fetch?: unknown }).fetch;
});

const useFetch = (f: jest.Mock) => {
  global.fetch = f as never;
  return f;
};

test('pending = photo hashes plus one manifest per finished inspection, minus stored receipts', async () => {
  const all = [hex(1), hex(2), hex(3), manifest([hex(1), hex(2)]), manifest([hex(3)])];
  expect((await pendingHashes(db)).sort()).toEqual(all.sort());
  mockStore.set(hex(2), { sha256: hex(2), receipt_id: 'x', server_time: 1 });
  expect(await pendingHashes(db)).not.toContain(hex(2));
});

test('posts to the edge function with the anon key headers', async () => {
  const fetch = useFetch(ok());
  await syncReceipts(db);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('https://proj.supabase.co/functions/v1/issue-receipts');
  expect(init).toMatchObject({ method: 'POST', headers: { apikey: 'anon-key', Authorization: 'Bearer anon-key' } });
});

test('the body contains only `hashes`, each 64 lowercase hex chars', async () => {
  mockRows.push({ inspection_id: 3, sha256: 'not-a-hash' }); // never sent, it would fail the whole batch
  const fetch = useFetch(ok());
  await syncReceipts(db);
  for (const [, init] of fetch.mock.calls) {
    const body = JSON.parse(init.body);
    expect(Object.keys(body)).toEqual(['hashes']);
    expect(init.body).toBe(JSON.stringify({ hashes: body.hashes }));
    for (const h of body.hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(sent(fetch)).not.toContain('not-a-hash');
});

test('a failed fetch (offline) keeps every hash pending and does not reject', async () => {
  useFetch(jest.fn().mockRejectedValue(new TypeError('Network request failed')));
  const before = await pendingHashes(db);
  await expect(syncReceipts(db)).resolves.toBeUndefined();
  expect(await pendingHashes(db)).toEqual(before);
  expect(mockStore.size).toBe(0);
});

test('a non-2xx response keeps every hash pending', async () => {
  useFetch(jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'boom' }) }));
  await syncReceipts(db);
  expect(mockStore.size).toBe(0);
});

test('success stores a receipt per hash; the next sync sends nothing', async () => {
  const fetch = useFetch(ok());
  await syncReceipts(db);
  expect(mockStore.size).toBe(5);
  expect(mockStore.get(hex(1))).toEqual({ sha256: hex(1), receipt_id: `r-${hex(1).slice(0, 4)}`, server_time: Date.parse(SERVER_TIME) });
  expect(await pendingHashes(db)).toEqual([]);
  fetch.mockClear();
  await syncReceipts(db);
  expect(fetch).not.toHaveBeenCalled();
});

test('offline first, then online: sends once, each hash exactly once', async () => {
  useFetch(jest.fn().mockRejectedValue(new TypeError('offline')));
  await syncReceipts(db);
  const fetch = useFetch(ok());
  await syncReceipts(db);
  await syncReceipts(db);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(new Set(sent(fetch)).size).toBe(sent(fetch).length);
  expect(mockStore.size).toBe(5);
});

test('a hash shared by two inspections is sent once', async () => {
  mockRows.push({ inspection_id: 2, sha256: hex(1) });
  const fetch = useFetch(ok());
  await syncReceipts(db);
  const hashes = sent(fetch);
  expect(hashes.filter((h) => h === hex(1))).toHaveLength(1);
  expect(new Set(hashes).size).toBe(hashes.length);
});

test('ignores receipts for hashes it did not send and malformed entries', async () => {
  useFetch(
    jest.fn(async () => ({
      ok: true,
      json: async () => ({
        receipts: [
          { sha256: hex(99), receipt_id: 'x', server_time: SERVER_TIME },
          { sha256: hex(1), receipt_id: 'x', server_time: 'not a date' },
          { sha256: hex(2), server_time: SERVER_TIME },
          { sha256: hex(3), receipt_id: 'ok', server_time: SERVER_TIME },
        ],
      }),
    })),
  );
  await syncReceipts(db);
  expect([...mockStore.keys()]).toEqual([hex(3)]);
});

test(`sends in batches of at most ${BATCH_SIZE}`, async () => {
  mockRows = Array.from({ length: 1100 }, (_, i) => ({ inspection_id: 1, sha256: hex(i) }));
  const fetch = useFetch(ok());
  await syncReceipts(db);
  const sizes = fetch.mock.calls.map(([, init]) => JSON.parse(init.body).hashes.length);
  expect(sizes).toEqual([500, 500, 101]); // 1100 photos + 1 manifest
  expect(mockStore.size).toBe(1101);
});

test('without config nothing is fetched and everything stays pending', async () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const fetch = useFetch(ok());
  await syncReceipts(db);
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  await syncReceipts(db);
  expect(fetch).not.toHaveBeenCalled();
  expect(mockStore.size).toBe(0);
});

test('concurrent syncs coalesce: one request, no duplicates', async () => {
  const fetch = useFetch(ok());
  await Promise.all([syncReceipts(db), syncReceipts(db), syncReceipts(db)]);
  expect(fetch).toHaveBeenCalledTimes(1); // the shared follow-up sync finds nothing pending
  expect(sent(fetch)).toHaveLength(5);
});

test('a hash finished during a sync is picked up by the follow-up sync', async () => {
  const fetch = useFetch(ok());
  const first = syncReceipts(db);
  mockRows = [...mockRows, { inspection_id: 4, sha256: hex(4) }];
  await Promise.all([first, syncReceipts(db)]);
  expect(sent(fetch)).toContain(hex(4));
  expect(new Set(sent(fetch)).size).toBe(sent(fetch).length);
});
