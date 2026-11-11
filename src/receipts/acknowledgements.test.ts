import { acknowledgeLink, fetchAcknowledgements } from './acknowledgements';

const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

beforeEach(() => {
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
const reply = (ok: boolean, body: unknown) => jest.fn().mockResolvedValue({ ok, json: async () => body });

test('link carries the full manifest hash', () => {
  expect(acknowledgeLink(HASH)).toBe(`https://unscratched.app/a/${HASH}`);
});

test('sends only the manifest hash and keeps well-formed rows', async () => {
  const fetch = useFetch(
    reply(true, [
      { landlord_name: 'Pat', acknowledged_at: '2026-11-11T15:04:05Z' },
      { landlord_name: 'No time' },
      { landlord_name: 42, acknowledged_at: '2026-11-11T15:04:05Z' },
    ]),
  );
  expect(await fetchAcknowledgements(HASH)).toEqual([{ name: 'Pat', at: Date.parse('2026-11-11T15:04:05Z') }]);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('https://proj.supabase.co/rest/v1/rpc/lookup_acknowledgements');
  expect(JSON.parse(init.body)).toEqual({ p_hash: HASH });
  expect(init.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer anon-key' });
});

test('returns [] on HTTP error, network failure, bad body, or missing config', async () => {
  useFetch(reply(false, {}));
  expect(await fetchAcknowledgements(HASH)).toEqual([]);
  useFetch(jest.fn().mockRejectedValue(new Error('offline')));
  expect(await fetchAcknowledgements(HASH)).toEqual([]);
  useFetch(reply(true, { not: 'an array' }));
  expect(await fetchAcknowledgements(HASH)).toEqual([]);
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  const fetch = useFetch(reply(true, []));
  expect(await fetchAcknowledgements(HASH)).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
