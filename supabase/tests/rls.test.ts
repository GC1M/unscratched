/**
 * @jest-environment node
 */
/// <reference types="node" />
import { randomBytes } from 'node:crypto';

// Integration test against a local Supabase (`npx supabase@latest start`), e.g.
// SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=<anon key> npm test -- supabase
const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_ANON_KEY;

if (!URL || !KEY) {
  console.log('Skipping supabase/tests/rls.test.ts: set SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY to run it.');
}

const headers = { apikey: KEY ?? '', Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const hex = () => randomBytes(32).toString('hex');

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
}

const insert = (sha256: string) => rest('receipts', { method: 'POST', body: JSON.stringify({ sha256 }) });
const lookup = (p_hash: string) => rest('rpc/lookup_receipt', { method: 'POST', body: JSON.stringify({ p_hash }) });

(URL && KEY ? describe : describe.skip)('receipts RLS (local Supabase)', () => {
  const hash = hex();

  beforeAll(async () => {
    expect((await insert(hash)).status).toBe(201);
  });

  it('rejects a duplicate sha256 with a unique violation', async () => {
    const res = await insert(hash);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('23505');
  });

  it('rejects a non-hex sha256', async () => {
    expect((await insert('not-a-hash')).ok).toBe(false);
  });

  it('denies anon select', async () => {
    const res = await rest(`receipts?select=*&sha256=eq.${hash}`);
    // No SELECT grant, so PostgREST answers 401 (42501); an empty list would also mean nothing leaked.
    if (res.ok) expect(await res.json()).toEqual([]);
    else expect([401, 403]).toContain(res.status);
  });

  it('denies anon update and delete', async () => {
    const upd = await rest(`receipts?sha256=eq.${hash}`, {
      method: 'PATCH',
      body: JSON.stringify({ server_time: '2000-01-01T00:00:00Z' }),
    });
    expect(upd.ok).toBe(false);
    const del = await rest(`receipts?sha256=eq.${hash}`, { method: 'DELETE' });
    expect(del.ok).toBe(false);
    const [row] = await (await lookup(hash)).json();
    expect(row.sha256).toBe(hash);
    expect(row.server_time).not.toMatch(/^2000-/);
  });

  it('lookup_receipt finds by full hash and by 12-char prefix', async () => {
    const [full] = await (await lookup(hash)).json();
    expect(full.sha256).toBe(hash);
    const [prefix] = await (await lookup(hash.slice(0, 12))).json();
    expect(prefix).toEqual(full);
  });

  it('lookup_receipt returns nothing for an unknown hash', async () => {
    expect(await (await lookup(hex())).json()).toEqual([]);
  });

  it('lookup_receipt rejects short or non-hex input', async () => {
    for (const bad of [hash.slice(0, 11), 'z'.repeat(12), hash.toUpperCase(), '']) {
      expect((await lookup(bad)).status).toBe(400);
    }
  });
});
