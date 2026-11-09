import { createHash } from 'crypto';

import { manifestHash, verificationCode } from './manifest';

const mockCreateHash = createHash;
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_alg: string, data: string) => mockCreateHash('sha256').update(data).digest('hex'),
}));

const a = 'a'.repeat(64);
const b = 'b'.repeat(64);
const c = 'c'.repeat(64);

test('is the SHA-256 hex of the sorted hashes joined with newlines', async () => {
  expect(await manifestHash([c, a, b])).toBe(createHash('sha256').update(`${a}\n${b}\n${c}`).digest('hex'));
});

test('does not depend on photo order and does not mutate the input', async () => {
  const input = [c, a, b];
  expect(await manifestHash(input)).toBe(await manifestHash([b, c, a]));
  expect(input).toEqual([c, a, b]);
});

test('changes when the photo set changes', async () => {
  expect(await manifestHash([a, b])).not.toBe(await manifestHash([a, c]));
});

test('no photos means no manifest and so no code', async () => {
  expect(await manifestHash([])).toBeNull();
});

test('the verification code is the first 12 hex chars', async () => {
  const m = (await manifestHash([a]))!;
  expect(verificationCode(m)).toBe(m.slice(0, 12));
  expect(verificationCode(m)).toMatch(/^[0-9a-f]{12}$/);
});
