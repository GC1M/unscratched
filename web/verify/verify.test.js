import { createHash } from 'node:crypto';
import { describe, expect, jest, test } from '@jest/globals';

import { formatTime, isValidCode, lookup, message, parseCode, toHex } from './verify';

const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'; // SHA-256 of "abc"

test('toHex encodes a known SHA-256', () => {
  expect(toHex(createHash('sha256').update('abc').digest())).toBe(HASH);
  expect(toHex(new Uint8Array([0, 15, 255]).buffer)).toBe('000fff');
});

describe('parseCode', () => {
  test('reads /v/<code>, with or without a trailing slash', () => {
    expect(parseCode('/v/abcdef012345', '')).toBe('abcdef012345');
    expect(parseCode('/v/abcdef012345/', '')).toBe('abcdef012345');
    expect(parseCode(`/v/${HASH}`, '')).toBe(HASH);
  });

  test('reads ?code=', () => {
    expect(parseCode('/', '?code=abcdef012345')).toBe('abcdef012345');
    expect(parseCode('/index.html', '?x=1&code=abcdef012345')).toBe('abcdef012345');
  });

  test('rejects invalid codes', () => {
    expect(parseCode('/v/ABCDEF012345', '')).toBeNull(); // uppercase
    expect(parseCode('/v/abcdef01234', '')).toBeNull(); // too short
    expect(parseCode('/v/abcdef01234g', '')).toBeNull(); // non-hex
    expect(parseCode(`/v/${HASH}0`, '')).toBeNull(); // too long
    expect(parseCode('/', '?code=ABCDEF012345')).toBeNull();
    expect(parseCode('/x/abcdef012345', '')).toBeNull();
    expect(parseCode('/', '')).toBeNull();
    expect(isValidCode(undefined)).toBe(false);
  });
});

describe('message', () => {
  const iso = '2026-11-09T15:04:05.000Z';

  test('found shows the local time with the time zone name', () => {
    expect(formatTime(iso)).toMatch(/2026/);
    expect(formatTime(iso)).toMatch(/Time|GMT|UTC/);
    expect(message('code', { status: 'found', serverTime: iso })).toBe(
      `This inspection's photo set was registered on the server at ${formatTime(iso)}.`,
    );
    expect(message('photo', { status: 'found', serverTime: iso })).toBe(
      `This photo existed on the server at ${formatTime(iso)}.`,
    );
  });

  test('not found and error', () => {
    expect(message('photo', { status: 'notfound' })).toBe('No receipt found for this photo.');
    expect(message('code', { status: 'notfound' })).toBe('No receipt found for this code.');
    expect(message('code', { status: 'error' })).toMatch(/Could not reach/);
  });
});

describe('lookup', () => {
  const config = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };
  const reply = (ok, body) => jest.fn().mockResolvedValue({ ok, json: async () => body });

  test('sends only the hash to the RPC and maps a row to found', async () => {
    const fetchImpl = reply(true, [{ sha256: HASH, server_time: '2026-11-09T15:04:05Z' }]);
    expect(await lookup(HASH, config, fetchImpl)).toEqual({ status: 'found', serverTime: '2026-11-09T15:04:05Z' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/lookup_receipt');
    expect(JSON.parse(init.body)).toEqual({ p_hash: HASH });
    expect(init.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer anon' });
  });

  test('empty result is notfound; HTTP or network failure is error', async () => {
    expect(await lookup(HASH, config, reply(true, []))).toEqual({ status: 'notfound' });
    expect(await lookup(HASH, config, reply(false, {}))).toEqual({ status: 'error' });
    expect(await lookup(HASH, config, jest.fn().mockRejectedValue(new Error('offline')))).toEqual({ status: 'error' });
  });
});
