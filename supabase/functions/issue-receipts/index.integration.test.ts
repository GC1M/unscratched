/**
 * @jest-environment node
 */
/// <reference types="node" />
import { request } from 'node:http';

// Runs against a served function (`supabase start` + `supabase functions serve`).
// Skipped unless SUPABASE_URL and SUPABASE_ANON_KEY are set in the environment.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const run = url && key ? describe : describe.skip;

// jest-expo replaces global fetch with a stub even in the node environment, so talk HTTP directly.
function call(method: string, body?: unknown) {
  return new Promise<{ status: number; json: () => Promise<any> }>((resolve, reject) => {
    const headers = { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const req = request(`${url}/functions/v1/issue-receipts`, { method, headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: async () => JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

const post = (body: unknown) => call('POST', body);

function randomHash() {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

run('issue-receipts (integration)', () => {
  it('returns receipts for valid hashes and the same receipt for a duplicate', async () => {
    const h = randomHash();
    const first = await post({ hashes: [h, h] });
    expect(first.status).toBe(200);
    const { receipts } = await first.json();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ sha256: h, receipt_id: expect.any(String) });
    expect(new Date(receipts[0].server_time).toISOString()).toBe(receipts[0].server_time);

    const again = await (await post({ hashes: [h] })).json();
    expect(again.receipts[0]).toEqual(receipts[0]);
  });

  it('rejects an invalid hash and extra fields', async () => {
    expect((await post({ hashes: ['nothex'] })).status).toBe(400);
    expect((await post({ hashes: [randomHash()], note: 'x' })).status).toBe(400);
  });

  it('rejects non-POST', async () => {
    expect((await call('GET')).status).toBe(405);
  });
});
