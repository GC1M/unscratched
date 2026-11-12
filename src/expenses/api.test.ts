import { loadGroup, localToday, signInFromLink } from './api';

// Any query chain resolves to an empty result; only the rpc call matters here.
const mockChain: any = { then: (done: (r: unknown) => void) => done({ data: [], error: null }) };
for (const m of ['select', 'eq', 'order']) mockChain[m] = () => mockChain;
mockChain.single = async () => ({ data: {}, error: null });
const mockRpc = jest.fn(async () => ({ data: 0, error: null }));
const mockSetSession = jest.fn(async () => ({ data: {}, error: null }));

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mockRpc, from: () => mockChain, auth: { setSession: mockSetSession } }) }));
jest.mock('expo-sqlite/kv-store', () => ({}));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('@/receipts/config', () => ({ receiptsConfig: () => ({ url: 'http://x', anonKey: 'k' }) }));

// 02:30 UTC on Nov 13 is still the evening of Nov 12 in New York (jest.globalSetup.js pins TZ).
beforeEach(() => jest.useFakeTimers({ now: new Date('2026-11-13T02:30:00Z') }));
afterEach(() => jest.useRealTimers());

it('localToday gives the local date, not the UTC one', () => {
  expect(localToday()).toBe('2026-11-12');
});

it('loadGroup passes the local date to materialize_recurring', async () => {
  await loadGroup('g');
  expect(mockRpc).toHaveBeenCalledWith('materialize_recurring', { p_group: 'g', p_today: '2026-11-12' });
});

it('signInFromLink sets the session from the link fragment and ignores other links', async () => {
  await expect(signInFromLink('unscratched://expenses#access_token=a%2Eb&expires_in=3600&refresh_token=r1&type=magiclink')).resolves.toBe(true);
  expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'a.b', refresh_token: 'r1' });
  await expect(signInFromLink('unscratched://inspection/3/export')).resolves.toBe(false);
  await expect(signInFromLink('unscratched://expenses#type=magiclink')).resolves.toBe(false);
  expect(mockSetSession).toHaveBeenCalledTimes(1);
});

it('signInFromLink throws the error the link carries', async () => {
  await expect(signInFromLink('unscratched://expenses#error=access_denied&error_description=Email+link+is+invalid+or+has+expired')).rejects.toThrow(
    'Email link is invalid or has expired',
  );
});
