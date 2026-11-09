/**
 * @jest-environment node
 */
/// <reference types="node" />
// Runs against a served function (`supabase start` + `supabase functions serve`).
// Skipped unless SUPABASE_URL and SUPABASE_ANON_KEY are set in the environment.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const run = url && key ? describe : describe.skip;

function post(body: unknown) {
  return fetch(`${url}/functions/v1/issue-receipts`, {
    method: 'POST',
    headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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
    const res = await fetch(`${url}/functions/v1/issue-receipts`, {
      headers: { apikey: key!, Authorization: `Bearer ${key}` },
    });
    expect(res.status).toBe(405);
  });
});
