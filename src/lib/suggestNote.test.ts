import type { Photo } from '@/db/types';

import { suggestNote, toCondition } from './suggestNote';

const mockSettings = new Map<string, string>();
jest.mock('@/db/repo', () => ({
  getSetting: async (_db: unknown, k: string) => mockSettings.get(k) ?? null,
  setSetting: async (_db: unknown, k: string, v: string) => void mockSettings.set(k, v),
}));
const mockResize = jest.fn();
const mockSave = jest.fn(async () => ({ uri: 'file:///cache/small.jpg', width: 768, height: 576, base64: '/9j/AAAA' }));
jest.mock('expo-image-manipulator', () => {
  const ctx = {
    resize: (size: object) => (mockResize(size), ctx),
    renderAsync: async () => ({ saveAsync: mockSave }),
  };
  return { SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: () => ctx } };
});
const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///docs' },
  File: jest.fn().mockImplementation((...parts: string[]) => ({ uri: parts.join('/'), delete: mockDelete })),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ABCDEF01-2345-4678-9ABC-DEF012345678' }));

const db = {} as never;
const photo: Photo = { id: 1, item_id: 7, file_uri: 'photos/a.jpg', sha256: 'x', captured_at: 1, width: 1600, height: 1200, source: 'camera' };
const respond = (status: number, body: unknown) => {
  const f = jest.fn(async () => ({ ok: status < 300, status, json: async () => body }));
  global.fetch = f as never;
  return f;
};

beforeEach(() => {
  mockSettings.clear();
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

test('severity maps to item condition', () => {
  expect(toCondition('none')).toBe('good');
  expect(toCondition('minor')).toBe('fair');
  expect(toCondition('major')).toBe('damaged');
});

test('downscales, sends one JPEG with a stable install id, and returns the suggestion', async () => {
  const fetch = respond(200, { caption: 'Scuff on wall', severity: 'minor' });
  expect(await suggestNote(db, photo)).toEqual({ caption: 'Scuff on wall', severity: 'minor' });
  expect(mockResize).toHaveBeenCalledWith({ width: 768 });
  expect(mockSave).toHaveBeenCalledWith({ compress: 0.6, format: 'jpeg', base64: true });
  expect(mockDelete).toHaveBeenCalled();
  const [url, init] = fetch.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
  expect(url).toBe('https://proj.supabase.co/functions/v1/suggest-note');
  expect(init.headers.apikey).toBe('anon-key');
  expect(JSON.parse(init.body)).toEqual({ install_id: 'abcdef01-2345-4678-9abc-def012345678', image: '/9j/AAAA' });

  await suggestNote(db, { ...photo, width: 600, height: 700 });
  expect(mockResize).toHaveBeenCalledTimes(1);
  expect(JSON.parse((fetch.mock.calls[1] as unknown as [string, { body: string }])[1].body).install_id).toBe(
    'abcdef01-2345-4678-9abc-def012345678',
  );
});

test('rate limit, server errors, and malformed replies throw', async () => {
  respond(429, { error: 'limit' });
  await expect(suggestNote(db, photo)).rejects.toThrow('Daily limit');
  respond(502, {});
  await expect(suggestNote(db, photo)).rejects.toThrow('Could not get a suggestion');
  respond(200, { caption: 'x', severity: 'constructor' });
  await expect(suggestNote(db, photo)).rejects.toThrow('Could not get a suggestion');
});

test('a build without Supabase config sends nothing', async () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  const fetch = respond(200, {});
  await expect(suggestNote(db, photo)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
