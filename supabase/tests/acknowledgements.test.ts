/**
 * @jest-environment node
 */
/// <reference types="node" />
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';

// Integration test against a local Supabase, same setup as rls.test.ts.
const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_ANON_KEY;

if (!URL || !KEY) {
  console.log('Skipping supabase/tests/acknowledgements.test.ts: set SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY to run it.');
}

const headers = { apikey: KEY ?? '', Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const hex = () => randomBytes(32).toString('hex');

// jest-expo replaces global fetch with a stub even in the node environment, so talk HTTP directly.
function rest(path: string, init: { method?: string; body?: string } = {}) {
  return new Promise<{ status: number; ok: boolean; json: () => Promise<any> }>((resolve, reject) => {
    const req = request(`${URL}/rest/v1/${path}`, { method: init.method ?? 'GET', headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        resolve({ status, ok: status >= 200 && status < 300, json: async () => JSON.parse(text) });
      });
    });
    req.on('error', reject);
    req.end(init.body);
  });
}

const post = (path: string, body: unknown) => rest(path, { method: 'POST', body: JSON.stringify(body) });
const ack = (p_hash: string, p_name: string) => post('rpc/acknowledge_report', { p_hash, p_name });
const lookup = (p_hash: string) => post('rpc/lookup_acknowledgements', { p_hash });

(URL && KEY ? describe : describe.skip)('acknowledgements (local Supabase)', () => {
  const hash = hex();

  beforeAll(async () => {
    expect((await post('receipts', { sha256: hash })).status).toBe(201);
  });

  it('creates an acknowledgement row and returns it from the lookup', async () => {
    const res = await ack(hash, '  Pat Landlord  ');
    expect(res.status).toBe(200);
    const [row] = await res.json();
    expect(row.landlord_name).toBe('Pat Landlord');
    expect(Date.parse(row.acknowledged_at)).not.toBeNaN();

    expect(await (await lookup(hash)).json()).toEqual([row]);
  });

  it('refuses a hash without a receipt', async () => {
    const res = await ack(hex(), 'Pat');
    expect(res.ok).toBe(false);
    expect((await res.json()).code).toBe('P0002');
  });

  it('rejects bad hashes and names', async () => {
    for (const [h, name] of [
      [hash.slice(0, 12), 'Pat'],
      [hash.toUpperCase(), 'Pat'],
      [hash, '   '],
      [hash, 'x'.repeat(101)],
      [hash, 'Pat\nLandlord'],
    ]) {
      const res = await ack(h, name);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('22023');
    }
    expect((await lookup(hash.slice(0, 12))).status).toBe(400);
  });

  it('caps acknowledgements at 5 per report', async () => {
    const h = hex();
    expect((await post('receipts', { sha256: h })).status).toBe(201);
    for (let i = 0; i < 5; i++) expect((await ack(h, `Name ${i}`)).status).toBe(200);
    const res = await ack(h, 'One too many');
    expect(res.ok).toBe(false);
    expect((await res.json()).code).toBe('54000');
    expect(await (await lookup(h)).json()).toHaveLength(5);
  });

  it('denies anon direct access to the table', async () => {
    const insert = await post('acknowledgements', { manifest_sha256: hash, landlord_name: 'Mallory' });
    expect(insert.ok).toBe(false);
    const select = await rest(`acknowledgements?select=*&manifest_sha256=eq.${hash}`);
    if (select.ok) expect(await select.json()).toEqual([]);
    else expect([401, 403]).toContain(select.status);
    const del = await rest(`acknowledgements?manifest_sha256=eq.${hash}`, { method: 'DELETE' });
    if (del.ok) expect(await (await lookup(hash)).json()).toHaveLength(1);
  });

  it('lookup returns nothing for an unknown hash', async () => {
    expect(await (await lookup(hex())).json()).toEqual([]);
  });
});
