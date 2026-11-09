// Deno edge function: thin wrapper around validate.ts. Never logs request bodies.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { parseBody, shapeReceipts, type ReceiptRow } from './validate.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'body must be valid JSON' });
  }
  const parsed = parseBody(body);
  if ('error' in parsed) return json(400, parsed);
  const { hashes } = parsed;

  // on conflict (sha256) do nothing: existing hashes keep their original receipt.
  const insert = await supabase
    .from('receipts')
    .upsert(hashes.map((sha256) => ({ sha256 })), { onConflict: 'sha256', ignoreDuplicates: true });
  if (insert.error) {
    console.error('insert failed', insert.error.code);
    return json(500, { error: 'could not store receipts' });
  }

  // Select in chunks so the `in` filter keeps the request URL short.
  const rows: ReceiptRow[] = [];
  for (let i = 0; i < hashes.length; i += 100) {
    const { data, error } = await supabase
      .from('receipts')
      .select('id, sha256, server_time')
      .in('sha256', hashes.slice(i, i + 100));
    if (error) {
      console.error('select failed', error.code);
      return json(500, { error: 'could not read receipts' });
    }
    rows.push(...(data as ReceiptRow[]));
  }

  return json(200, { receipts: shapeReceipts(hashes, rows) });
});
