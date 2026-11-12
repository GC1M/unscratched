import { loadGroup, localToday } from './api';

// Any query chain resolves to an empty result; only the rpc call matters here.
const mockChain: any = { then: (done: (r: unknown) => void) => done({ data: [], error: null }) };
for (const m of ['select', 'eq', 'order']) mockChain[m] = () => mockChain;
mockChain.single = async () => ({ data: {}, error: null });
const mockRpc = jest.fn(async () => ({ data: 0, error: null }));

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mockRpc, from: () => mockChain }) }));
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
