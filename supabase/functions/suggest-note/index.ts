// Deno edge function: thin wrapper around suggest.ts. Never logs or stores request bodies (they hold a photo).
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { handle, MAX_IMAGE_BYTES } from './suggest.ts';

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

async function bumpUsage(installId: string): Promise<number> {
  const { data, error } = await supabase.rpc('bump_suggest_note_usage', { p_install_id: installId });
  if (error) {
    console.error('usage bump failed', error.code);
    throw new Error('usage bump failed');
  }
  return data as number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  // Base64 is 4/3 of the image; refuse a body far past that before reading it.
  if (Number(req.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES * 2) return json(413, { error: 'body too large' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'body must be valid JSON' });
  }
  const res = await handle(body, { bumpUsage, apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? null, fetchFn: fetch });
  return json(res.status, res.body);
});
