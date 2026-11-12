/**
 * @jest-environment node
 */
/// <reference types="node" />
import { randomBytes, randomUUID } from 'node:crypto';
import { request } from 'node:http';

// Integration test against a local Supabase with `supabase functions serve` running, same setup as expenses.test.ts.
// Deletes accounts through the delete-account edge function and checks what is left for the other members.
const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_ANON_KEY;

if (!URL || !KEY) {
  console.log('Skipping supabase/tests/delete_account.test.ts: set SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY to run it.');
}

type Res = { status: number; ok: boolean; body: any };
type User = { id: string; token: string; email: string; password: string };

// jest-expo replaces global fetch with a stub even in the node environment, so talk HTTP directly.
function call(path: string, token: string, method = 'GET', body?: unknown): Promise<Res> {
  const headers = { apikey: KEY ?? '', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  return new Promise((resolve, reject) => {
    const req = request(`${URL}${path}`, { method, headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        resolve({ status, ok: status >= 200 && status < 300, body: text ? JSON.parse(text) : null });
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function signUp(): Promise<User> {
  const email = `t-${randomUUID()}@example.com`;
  const password = randomBytes(12).toString('hex');
  const res = await call('/auth/v1/signup', KEY ?? '', 'POST', { email, password });
  expect(res.ok).toBe(true);
  return { id: res.body.user.id, token: res.body.access_token, email, password };
}

const rpc = (token: string, fn: string, args: object) => call(`/rest/v1/rpc/${fn}`, token, 'POST', args);
const select = (token: string, query: string) => call(`/rest/v1/${query}`, token);
const deleteAccount = (token: string) => call('/functions/v1/delete-account', token, 'POST');
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

(URL && KEY ? describe : describe.skip)('delete account (local Supabase)', () => {
  it('refuses a caller without a user session', async () => {
    expect((await deleteAccount(KEY ?? '')).status).toBe(401);
  });

  it('keeps shared history for the other members with no trace of the deleted account', async () => {
    const [zelda, bo] = await Promise.all([signUp(), signUp()]);
    const g = (await rpc(zelda.token, 'create_group', { p_name: 'Flat 2', p_currency: 'USD', p_display_name: 'Zelda' })).body;
    expect((await rpc(bo.token, 'join_group', { p_code: g.invite_code, p_display_name: 'Bo' })).ok).toBe(true);
    const shares = { [zelda.id]: 600, [bo.id]: 400 };
    const saved = await rpc(zelda.token, 'save_expense', {
      p_id: null, p_group: g.id, p_description: 'Groceries', p_amount: 1000, p_payers: { [zelda.id]: 1000 },
      p_category: 'groceries', p_spent_on: null, p_split_mode: 'itemized', p_shares: shares,
      p_items: [{ name: 'Milk', cents: 600, members: [zelda.id] }, { name: 'Bread', cents: 400, members: [bo.id] }],
    });
    expect(saved.ok).toBe(true);
    expect((await call('/rest/v1/expense_comments', zelda.token, 'POST',
      { expense_id: saved.body.id, group_id: g.id, body: 'from the corner shop' })).ok).toBe(true);
    expect((await call('/rest/v1/settlements', zelda.token, 'POST',
      { group_id: g.id, from_id: zelda.id, to_id: bo.id, amount_cents: 100 })).ok).toBe(true);
    expect((await rpc(zelda.token, 'save_recurring', {
      p_group: g.id, p_description: 'Rent', p_amount: 1000, p_payer: zelda.id, p_category: 'rent', p_split_mode: 'exact',
      p_shares: shares, p_every: 'monthly', p_next_on: inDays(5),
    })).ok).toBe(true);

    const res = await deleteAccount(zelda.token);
    expect([res.status, res.body]).toEqual([200, { deleted: true }]);

    // Bo still has the group, the expense with its amounts, the comment and the payment.
    const members = (await select(bo.token, `group_members?group_id=eq.${g.id}&select=user_id,display_name,left_at`)).body;
    const ghost = members.find((m: any) => m.user_id !== bo.id);
    expect(ghost).toMatchObject({ display_name: 'Former member', left_at: expect.any(String) });
    const expenses = (await select(bo.token, `expenses?group_id=eq.${g.id}&select=amount_cents,payer_id,items,created_by,expense_shares(user_id,amount_cents)`)).body;
    expect(expenses).toEqual([{
      amount_cents: 1000, payer_id: ghost.user_id, created_by: ghost.user_id,
      items: [{ name: 'Milk', cents: 600, members: [ghost.user_id] }, { name: 'Bread', cents: 400, members: [bo.id] }],
      expense_shares: expect.arrayContaining([{ user_id: ghost.user_id, amount_cents: 600 }, { user_id: bo.id, amount_cents: 400 }]),
    }]);
    expect((await select(bo.token, `expense_comments?group_id=eq.${g.id}&select=user_id,body`)).body)
      .toEqual([{ user_id: ghost.user_id, body: 'from the corner shop' }]);
    expect((await select(bo.token, `settlements?group_id=eq.${g.id}&select=from_id,to_id,amount_cents`)).body)
      .toEqual([{ from_id: ghost.user_id, to_id: bo.id, amount_cents: 100 }]);
    // Their recurring rent stops, and Bo takes over as the group's creator.
    expect((await select(bo.token, `recurring_expenses?group_id=eq.${g.id}`)).body).toEqual([]);
    expect((await select(bo.token, `expense_groups?id=eq.${g.id}&select=created_by`)).body).toEqual([{ created_by: bo.id }]);

    // Nothing Bo can read still names the account or its id.
    const everything = await Promise.all(
      ['expense_groups?id', 'group_members?group_id', 'expenses?group_id', 'expense_shares?group_id', 'expense_payers?group_id',
        'expense_comments?group_id', 'settlements?group_id', 'group_activity?group_id']
        .map((q) => select(bo.token, `${q}=eq.${g.id}`)),
    );
    for (const r of everything) expect(r.ok).toBe(true);
    const text = JSON.stringify(everything.map((r) => r.body));
    expect(text).not.toContain(zelda.id);
    expect(text).not.toContain('Zelda');

    // The account is gone: no sign-in, and its leftover access token reaches nothing.
    const signIn = await call('/auth/v1/token?grant_type=password', KEY ?? '', 'POST', { email: zelda.email, password: zelda.password });
    expect(signIn.ok).toBe(false);
    expect((await select(zelda.token, `expense_groups?id=eq.${g.id}`)).body).toEqual([]);
    expect((await deleteAccount(zelda.token)).status).toBe(401);
  });

  it('deletes a group no other signed-up member is still in', async () => {
    const [solo, left, other] = await Promise.all([signUp(), signUp(), signUp()]);
    const g = (await rpc(solo.token, 'create_group', { p_name: 'Just me', p_currency: 'USD', p_display_name: 'Solo' })).body;
    expect((await rpc(left.token, 'join_group', { p_code: g.invite_code, p_display_name: 'Lee' })).ok).toBe(true);
    expect((await rpc(left.token, 'remove_member', { p_group: g.id })).ok).toBe(true);
    const dee = (await rpc(solo.token, 'add_placeholder', { p_group: g.id, p_name: 'Dee' })).body;
    expect((await rpc(solo.token, 'save_expense', {
      p_id: null, p_group: g.id, p_description: 'Paint', p_amount: 500, p_payers: { [solo.id]: 500 }, p_category: 'household',
      p_spent_on: null, p_split_mode: 'exact', p_shares: { [solo.id]: 250, [dee.user_id]: 250 },
    })).ok).toBe(true);

    expect((await deleteAccount(solo.token)).status).toBe(200);

    // The invite code no longer finds a group, and the member who left cannot come back to it.
    expect((await rpc(other.token, 'group_preview', { p_code: g.invite_code })).body).toBeNull();
    expect((await rpc(left.token, 'join_group', { p_code: g.invite_code, p_display_name: 'Lee' })).ok).toBe(false);
  });
});
