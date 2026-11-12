/**
 * @jest-environment node
 */
/// <reference types="node" />
import { randomBytes, randomUUID } from 'node:crypto';
import { request } from 'node:http';

// Integration test against a local Supabase, same setup as rls.test.ts. Signs up throwaway users (email confirmation
// is off locally) and checks that group data only reaches members and that money writes stay consistent.
const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_ANON_KEY;

if (!URL || !KEY) {
  console.log('Skipping supabase/tests/expenses.test.ts: set SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY to run it.');
}

type Res = { status: number; ok: boolean; body: any };

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

async function signUp(): Promise<{ id: string; token: string }> {
  const email = `t-${randomUUID()}@example.com`;
  const res = await call('/auth/v1/signup', KEY ?? '', 'POST', { email, password: randomBytes(12).toString('hex') });
  expect(res.ok).toBe(true);
  return { id: res.body.user.id, token: res.body.access_token };
}

const rpc = (token: string, fn: string, args: object) => call(`/rest/v1/rpc/${fn}`, token, 'POST', args);
const select = (token: string, query: string) => call(`/rest/v1/${query}`, token);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

(URL && KEY ? describe : describe.skip)('shared expenses (local Supabase)', () => {
  let a: { id: string; token: string };
  let b: { id: string; token: string };
  let outsider: { id: string; token: string };
  let group: { id: string; invite_code: string };

  const expense = (over: object = {}) => ({
    p_id: null, p_group: group.id, p_description: 'Groceries', p_amount: 1000, p_payers: { [a.id]: 1000 }, p_category: 'groceries',
    p_spent_on: null, p_split_mode: 'equal', p_shares: { [a.id]: 500, [b.id]: 500 }, ...over,
  });

  beforeAll(async () => {
    [a, b, outsider] = await Promise.all([signUp(), signUp(), signUp()]);
    const created = await rpc(a.token, 'create_group', { p_name: 'Flat 4', p_currency: 'usd', p_display_name: 'Ana' });
    expect(created.ok).toBe(true);
    group = created.body;
    expect(group.invite_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect((await rpc(b.token, 'join_group', { p_code: group.invite_code.toLowerCase(), p_display_name: 'Bo' })).ok).toBe(true);
  });

  it('anon cannot create a group', async () => {
    expect((await rpc(KEY ?? '', 'create_group', { p_name: 'x', p_currency: 'USD', p_display_name: 'x' })).ok).toBe(false);
  });

  it('a wrong invite code is refused', async () => {
    const res = await rpc(outsider.token, 'join_group', { p_code: 'ZZZZZZZZ', p_display_name: 'Cy' });
    expect(res.ok).toBe(false);
    expect(res.body.code).toBe('P0002');
  });

  it('members see the group and each other; outsiders see nothing', async () => {
    expect((await select(b.token, `group_members?group_id=eq.${group.id}&select=display_name&order=display_name`)).body)
      .toEqual([{ display_name: 'Ana' }, { display_name: 'Bo' }]);
    expect((await select(outsider.token, `expense_groups?id=eq.${group.id}`)).body).toEqual([]);
    expect((await select(outsider.token, `group_members?group_id=eq.${group.id}`)).body).toEqual([]);
  });

  it('saves an expense with shares that add up, readable by members only', async () => {
    const saved = await rpc(b.token, 'save_expense', expense());
    expect(saved.ok).toBe(true);
    const shares = await select(b.token, `expense_shares?expense_id=eq.${saved.body.id}&select=user_id,amount_cents`);
    expect(shares.body).toHaveLength(2);
    expect((await select(outsider.token, `expenses?id=eq.${saved.body.id}`)).body).toEqual([]);
    expect((await select(outsider.token, `expense_shares?expense_id=eq.${saved.body.id}`)).body).toEqual([]);
  });

  it('edits an expense and replaces its shares', async () => {
    const saved = await rpc(a.token, 'save_expense', expense());
    const edited = await rpc(a.token, 'save_expense', expense({ p_id: saved.body.id, p_amount: 900, p_payers: { [a.id]: 900 }, p_shares: { [b.id]: 900 } }));
    expect(edited.ok).toBe(true);
    expect((await select(a.token, `expense_shares?expense_id=eq.${saved.body.id}&select=user_id,amount_cents`)).body)
      .toEqual([{ user_id: b.id, amount_cents: 900 }]);
  });

  it('refuses shares that do not add up, negative or fractional shares, and non-member share holders', async () => {
    for (const p_shares of [{ [a.id]: 500, [b.id]: 499 }, { [a.id]: 1100, [b.id]: -100 }, { [a.id]: 500.5, [b.id]: 499.5 },
      { [a.id]: 500, [outsider.id]: 500 }, {}]) {
      const res = await rpc(a.token, 'save_expense', expense({ p_shares }));
      expect(res.ok).toBe(false);
      expect(res.body.code).toBe('22023');
    }
  });

  it('refuses a payer who is not a member and an outsider writing to the group', async () => {
    expect((await rpc(a.token, 'save_expense', expense({ p_payers: { [outsider.id]: 1000 } }))).ok).toBe(false);
    const res = await rpc(outsider.token, 'save_expense', expense());
    expect(res.ok).toBe(false);
    expect(res.body.code).toBe('42501');
  });

  it('refuses a receipt stored outside the group folder', async () => {
    const res = await rpc(a.token, 'save_expense', expense({ p_receipt_path: `${randomUUID()}/r.jpg` }));
    expect(res.body.code).toBe('22023');
    expect((await rpc(a.token, 'save_expense', expense({ p_receipt_path: `${group.id}/r.jpg` }))).ok).toBe(true);
  });

  it('members record settlements; outsiders cannot', async () => {
    const body = { group_id: group.id, from_id: b.id, to_id: a.id, amount_cents: 500 };
    expect((await call('/rest/v1/settlements', b.token, 'POST', body)).status).toBe(201);
    expect((await call('/rest/v1/settlements', outsider.token, 'POST', body)).ok).toBe(false);
    expect((await call('/rest/v1/settlements', b.token, 'POST', { ...body, to_id: b.id })).ok).toBe(false);
  });

  it('materializes due recurring expenses once', async () => {
    const saved = await rpc(a.token, 'save_recurring', {
      p_group: group.id, p_description: 'Rent', p_amount: 200000, p_payer: a.id, p_category: 'rent', p_split_mode: 'equal',
      p_shares: { [a.id]: 100000, [b.id]: 100000 }, p_every: 'weekly', p_next_on: daysAgo(10),
    });
    expect(saved.ok).toBe(true);
    expect((await rpc(b.token, 'materialize_recurring', { p_group: group.id })).body).toBe(2);
    expect((await rpc(b.token, 'materialize_recurring', { p_group: group.id })).body).toBe(0);
    const rows = await select(a.token, `expenses?recurring_id=eq.${saved.body.id}&select=spent_on&order=spent_on`);
    expect(rows.body.map((r: { spent_on: string }) => r.spent_on)).toEqual([daysAgo(10), daysAgo(3)]);
    expect((await rpc(outsider.token, 'materialize_recurring', { p_group: group.id })).ok).toBe(false);
  });

  it('a member can delete an expense; an outsider cannot', async () => {
    const saved = await rpc(a.token, 'save_expense', expense());
    expect((await rpc(outsider.token, 'delete_expense', { p_id: saved.body.id })).ok).toBe(false);
    expect((await select(a.token, `expenses?id=eq.${saved.body.id}&select=deleted_at`)).body).toEqual([{ deleted_at: null }]);
    expect((await rpc(b.token, 'delete_expense', { p_id: saved.body.id })).ok).toBe(true);
    expect((await select(a.token, `expenses?id=eq.${saved.body.id}&select=deleted_at`)).body[0].deleted_at).not.toBeNull();
  });
});
