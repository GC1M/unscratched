/**
 * @jest-environment node
 */
/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';

import { DAILY_LIMIT, MAX_IMAGE_BYTES } from './suggest';

// Runs against a served function (`supabase start` + `supabase functions serve`).
// Skipped unless SUPABASE_URL and SUPABASE_ANON_KEY are set in the environment.
// Serve without ANTHROPIC_API_KEY: valid requests then stop at 503 after the rate-limit check, so nothing calls the model.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const run = url && key ? describe : describe.skip;

// jest-expo replaces global fetch with a stub even in the node environment, so talk HTTP directly.
function post(body: unknown) {
  return new Promise<{ status: number; json: () => Promise<any> }>((resolve, reject) => {
    const headers = { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const req = request(`${url}/functions/v1/suggest-note`, { method: 'POST', headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: async () => JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

const jpeg = (bytes: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(bytes - 3, 1)]).toString('base64');

run('suggest-note (integration)', () => {
  it('rejects an oversized image with 413', async () => {
    expect((await post({ install_id: randomUUID(), image: jpeg(MAX_IMAGE_BYTES + 1) })).status).toBe(413);
  });

  it('rejects a non-JPEG with 400', async () => {
    expect((await post({ install_id: randomUUID(), image: Buffer.from('GIF89a').toString('base64') })).status).toBe(400);
  });

  it('rejects an install over the daily limit with 429', async () => {
    const body = { install_id: randomUUID(), image: jpeg(100) };
    for (let i = 0; i < DAILY_LIMIT; i++) expect((await post(body)).status).not.toBe(429);
    const over = await post(body);
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: expect.any(String) });
    // Other installs are unaffected.
    expect((await post({ ...body, install_id: randomUUID() })).status).not.toBe(429);
  });
});
