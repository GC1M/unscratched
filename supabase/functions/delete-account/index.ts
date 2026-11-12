// Deno edge function: deletes the signed-in caller's shared-expenses account. See delete_account() in
// supabase/migrations/20261114000000_delete_account.sql for what happens to their groups.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  // The user id comes only from a token Auth accepts, never from the request body.
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const { data, error: authError } = await supabase.auth.getUser(token);
  if (authError || !data.user) return json(401, { error: 'sign in first' });

  const { data: receipts, error } = await supabase.rpc('delete_account', { p_user: data.user.id });
  if (error) {
    console.error('delete_account failed', error.code);
    return json(500, { error: 'could not delete the account' });
  }

  // ponytail: the account and rows are already gone, so a failed photo delete is logged rather than undone. Those
  // files sit in folders of deleted groups, which no one can read; rerun the removal by prefix if this ever logs.
  const paths = receipts as string[];
  for (let i = 0; i < paths.length; i += 1000) {
    const { error: removeError } = await supabase.storage.from('expense-receipts').remove(paths.slice(i, i + 1000));
    if (removeError) console.error('receipt removal failed', removeError.message);
  }
  return json(200, { deleted: true });
});
