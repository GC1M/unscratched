/**
 * @jest-environment node
 */
/// <reference types="node" />
import { randomBytes, randomUUID } from 'node:crypto';
import { request } from 'node:http';

// Integration test against a local Supabase, same setup as expenses.test.ts. Covers several payers, notes and other
// currencies, soft delete, placeholders and claiming them, leaving, comments, group settings, deleting a group, a fresh
// invite code and the activity log.
const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_ANON_KEY;

if (!URL || !KEY) {
  console.log('Skipping supabase/tests/expenses_more.test.ts: set SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY to run it.');
}

type Res = { status: number; ok: boolean; body: any };
type User = { id: string; token: string };
type Group = { id: string; invite_code: string };

// jest-expo replaces global fetch with a stub even in the node environment, so talk HTTP directly. Writes ask for the
// affected rows back, so a write that RLS filtered out shows up as [].
function call(path: string, token: string, method = 'GET', body?: unknown): Promise<Res> {
  const headers = {
    apikey: KEY ?? '', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation',
  };
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
  const res = await call('/auth/v1/signup', KEY ?? '', 'POST', { email, password: randomBytes(12).toString('hex') });
  expect(res.ok).toBe(true);
  return { id: res.body.user.id, token: res.body.access_token };
}

const rpc = (token: string, fn: string, args: object) => call(`/rest/v1/rpc/${fn}`, token, 'POST', args);
const select = (token: string, query: string) => call(`/rest/v1/${query}`, token);
const insert = (token: string, table: string, row: object) => call(`/rest/v1/${table}`, token, 'POST', row);
const patch = (token: string, query: string, row: object) => call(`/rest/v1/${query}`, token, 'PATCH', row);
const del = (token: string, query: string) => call(`/rest/v1/${query}`, token, 'DELETE');
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const inDays = (n: number) => daysAgo(-n);

async function makeGroup(owner: User, ...others: User[]): Promise<Group> {
  const created = await rpc(owner.token, 'create_group', { p_name: 'Flat 9', p_currency: 'USD', p_display_name: 'Ana' });
  expect(created.ok).toBe(true);
  for (const [i, u] of others.entries()) {
    expect((await rpc(u.token, 'join_group', { p_code: created.body.invite_code, p_display_name: `M${i}` })).ok).toBe(true);
  }
  return created.body;
}

const expenseArgs = (group: Group, payers: object, shares: object, over: object = {}) => {
  const amount = Object.values(shares).reduce((s: number, v) => s + (v as number), 0);
  return {
    p_id: null, p_group: group.id, p_description: 'Groceries', p_amount: amount, p_payers: payers, p_category: 'groceries',
    p_spent_on: null, p_split_mode: 'exact', p_shares: shares, ...over,
  };
};

const recurringArgs = (group: Group, payer: string, shares: object, over: object = {}) => ({
  p_group: group.id, p_description: 'Rent', p_amount: Object.values(shares).reduce((s: number, v) => s + (v as number), 0),
  p_payer: payer, p_category: 'rent', p_split_mode: 'exact', p_shares: shares, p_every: 'monthly', p_next_on: inDays(5),
  ...over,
});

const activity = async (token: string, group: Group) =>
  (await select(token, `group_activity?group_id=eq.${group.id}&select=kind,actor_id,ref_id,detail&order=id`)).body as {
    kind: string; actor_id: string | null; ref_id: string | null; detail: any;
  }[];

(URL && KEY ? describe : describe.skip)('more shared expenses (local Supabase)', () => {
  let a: User;
  let b: User;
  let c: User;
  let outsider: User;

  beforeAll(async () => {
    [a, b, c, outsider] = await Promise.all([signUp(), signUp(), signUp(), signUp()]);
  });

  describe('several payers', () => {
    let g: Group;
    beforeAll(async () => {
      g = await makeGroup(a, b, c);
    });

    it('saves payers, drops zero amounts and shows the biggest payer', async () => {
      const saved = await rpc(a.token, 'save_expense',
        expenseArgs(g, { [a.id]: 300, [b.id]: 700, [c.id]: 0 }, { [a.id]: 500, [b.id]: 500 }));
      expect(saved.ok).toBe(true);
      expect(saved.body.payer_id).toBe(b.id);
      const payers = await select(c.token, `expense_payers?expense_id=eq.${saved.body.id}&select=user_id,amount_cents,group_id&order=amount_cents`);
      expect(payers.body).toEqual([
        { user_id: a.id, amount_cents: 300, group_id: g.id }, { user_id: b.id, amount_cents: 700, group_id: g.id },
      ]);
    });

    it('replaces payers on edit', async () => {
      const saved = await rpc(a.token, 'save_expense', expenseArgs(g, { [a.id]: 1000 }, { [a.id]: 500, [b.id]: 500 }));
      const edited = await rpc(a.token, 'save_expense',
        expenseArgs(g, { [c.id]: 600, [b.id]: 200 }, { [a.id]: 800 }, { p_id: saved.body.id }));
      expect(edited.ok).toBe(true);
      expect(edited.body.payer_id).toBe(c.id);
      expect((await select(a.token, `expense_payers?expense_id=eq.${saved.body.id}&select=user_id,amount_cents&order=amount_cents`)).body)
        .toEqual([{ user_id: b.id, amount_cents: 200 }, { user_id: c.id, amount_cents: 600 }]);
    });

    it('refuses payers that do not add up, are negative, fractional, empty, or not members', async () => {
      for (const payers of [{ [a.id]: 300, [b.id]: 600 }, { [a.id]: 1100, [b.id]: -100 }, { [a.id]: 999.5, [b.id]: 0.5 }, {},
        { [a.id]: 500, [outsider.id]: 500 }, { [a.id]: 500, [randomUUID()]: 500 }]) {
        const res = await rpc(a.token, 'save_expense', expenseArgs(g, payers, { [a.id]: 500, [b.id]: 500 }));
        expect(res.ok).toBe(false);
        expect(res.body.code).toBe('22023');
      }
      const missing = await rpc(a.token, 'save_expense', { ...expenseArgs(g, {}, { [a.id]: 1000 }), p_payers: null });
      expect(missing.body.code).toBe('22023');
    });

    it('outsiders cannot read payers', async () => {
      const saved = await rpc(a.token, 'save_expense', expenseArgs(g, { [a.id]: 1000 }, { [a.id]: 1000 }));
      expect((await select(outsider.token, `expense_payers?expense_id=eq.${saved.body.id}`)).body).toEqual([]);
      expect((await select(outsider.token, `expense_payers?group_id=eq.${g.id}`)).body).toEqual([]);
    });
  });

  describe('expense fields', () => {
    let g: Group;
    beforeAll(async () => {
      g = await makeGroup(a, b);
    });
    const save = (over: object) => rpc(a.token, 'save_expense', expenseArgs(g, { [a.id]: 1000 }, { [a.id]: 400, [b.id]: 600 }, over));

    it('accepts the adjust split mode and still refuses unknown modes', async () => {
      expect((await save({ p_split_mode: 'adjust' })).body.split_mode).toBe('adjust');
      expect((await save({ p_split_mode: 'bogus' })).body.code).toBe('23514');
    });

    it('trims notes and stores blank notes as null', async () => {
      expect((await save({ p_notes: '  paid cash  ' })).body.notes).toBe('paid cash');
      expect((await save({ p_notes: '   ' })).body.notes).toBeNull();
      expect((await save({})).body.notes).toBeNull();
      expect((await save({ p_notes: 'x'.repeat(501) })).body.code).toBe('23514');
    });

    it('keeps the original currency and amount together', async () => {
      const both = await save({ p_original_currency: 'EUR', p_original_amount: 920 });
      expect(both.ok).toBe(true);
      expect([both.body.original_currency, both.body.original_amount_cents]).toEqual(['EUR', 920]);
      for (const over of [{ p_original_currency: 'EUR' }, { p_original_amount: 920 },
        { p_original_currency: 'eur', p_original_amount: 920 }, { p_original_currency: 'EUR', p_original_amount: 0 }]) {
        const res = await save(over);
        expect(res.ok).toBe(false);
        expect(res.body.code).toBe('23514');
      }
    });
  });

  describe('soft delete', () => {
    let g: Group;
    beforeAll(async () => {
      g = await makeGroup(a, b);
    });
    const save = () => rpc(a.token, 'save_expense', expenseArgs(g, { [a.id]: 1000 }, { [a.id]: 500, [b.id]: 500 }));
    const deletedAt = async (id: string) => (await select(a.token, `expenses?id=eq.${id}&select=deleted_at`)).body[0].deleted_at;

    it('marks the expense deleted, keeps the rows, and restores it', async () => {
      const saved = await save();
      expect((await rpc(b.token, 'delete_expense', { p_id: saved.body.id })).ok).toBe(true);
      expect(await deletedAt(saved.body.id)).not.toBeNull();
      expect((await select(b.token, `expense_shares?expense_id=eq.${saved.body.id}`)).body).toHaveLength(2);
      expect((await select(b.token, `expense_payers?expense_id=eq.${saved.body.id}`)).body).toHaveLength(1);
      expect((await rpc(a.token, 'delete_expense', { p_id: saved.body.id, p_restore: true })).ok).toBe(true);
      expect(await deletedAt(saved.body.id)).toBeNull();
    });

    it('refuses deleting twice, restoring what is not deleted, and unknown ids', async () => {
      const saved = await save();
      expect((await rpc(a.token, 'delete_expense', { p_id: saved.body.id, p_restore: true })).body.code).toBe('P0002');
      expect((await rpc(a.token, 'delete_expense', { p_id: saved.body.id })).ok).toBe(true);
      expect((await rpc(a.token, 'delete_expense', { p_id: saved.body.id })).body.code).toBe('P0002');
      expect((await rpc(a.token, 'delete_expense', { p_id: randomUUID() })).body.code).toBe('P0002');
    });

    it('outsiders cannot delete or restore, and nobody can hard delete', async () => {
      const saved = await save();
      expect((await rpc(outsider.token, 'delete_expense', { p_id: saved.body.id })).body.code).toBe('P0002');
      expect(await deletedAt(saved.body.id)).toBeNull();
      const hard = await del(b.token, `expenses?id=eq.${saved.body.id}`);
      expect(hard.ok).toBe(false);
      expect(hard.body.code).toBe('42501');
      expect((await select(a.token, `expenses?id=eq.${saved.body.id}&select=id`)).body).toHaveLength(1);
      await rpc(a.token, 'delete_expense', { p_id: saved.body.id });
      expect((await rpc(outsider.token, 'delete_expense', { p_id: saved.body.id, p_restore: true })).body.code).toBe('P0002');
      expect(await deletedAt(saved.body.id)).not.toBeNull();
    });

    it('a deleted expense cannot be edited', async () => {
      const saved = await save();
      await rpc(a.token, 'delete_expense', { p_id: saved.body.id });
      const res = await rpc(a.token, 'save_expense',
        expenseArgs(g, { [a.id]: 1000 }, { [a.id]: 1000 }, { p_id: saved.body.id }));
      expect(res.body.code).toBe('P0002');
      expect((await select(a.token, `expense_shares?expense_id=eq.${saved.body.id}`)).body).toHaveLength(2);
    });

    it('balances ignore deleted expenses', async () => {
      const g2 = await makeGroup(a, b);
      const saved = await rpc(a.token, 'save_expense', expenseArgs(g2, { [a.id]: 1000 }, { [a.id]: 500, [b.id]: 500 }));
      expect((await rpc(b.token, 'remove_member', { p_group: g2.id })).body.code).toBe('23514');
      await rpc(a.token, 'delete_expense', { p_id: saved.body.id });
      expect((await rpc(b.token, 'remove_member', { p_group: g2.id })).ok).toBe(true);
    });

    it('member_balance and log_activity are not callable by clients', async () => {
      const bal = await rpc(a.token, 'member_balance', { p_group: g.id, p_user: b.id });
      expect(bal.ok).toBe(false);
      const log = await rpc(outsider.token, 'log_activity', { p_group: g.id, p_kind: 'expense_added', p_ref: null, p_detail: {} });
      expect(log.ok).toBe(false);
    });
  });

  describe('placeholders', () => {
    let g: Group;
    beforeAll(async () => {
      g = await makeGroup(a, b);
    });

    it('members add placeholders; outsiders cannot', async () => {
      const added = await rpc(b.token, 'add_placeholder', { p_group: g.id, p_name: '  Dee  ' });
      expect(added.ok).toBe(true);
      expect(added.body).toMatchObject({ group_id: g.id, display_name: 'Dee', placeholder: true, left_at: null });
      expect(added.body.user_id).not.toBe(b.id);
      const res = await rpc(outsider.token, 'add_placeholder', { p_group: g.id, p_name: 'Eve' });
      expect(res.body.code).toBe('42501');
      expect((await select(a.token, `group_members?group_id=eq.${g.id}&display_name=eq.Eve`)).body).toEqual([]);
    });

    it('group_preview shows the name and open spots for a valid code only', async () => {
      const g2 = await makeGroup(a);
      const p = (await rpc(a.token, 'add_placeholder', { p_group: g2.id, p_name: 'Finn' })).body;
      const preview = await rpc(outsider.token, 'group_preview', { p_code: ` ${g2.invite_code.toLowerCase()} ` });
      expect(preview.body).toEqual({
        id: g2.id, name: 'Flat 9', currency: 'USD', placeholders: [{ user_id: p.user_id, display_name: 'Finn' }],
      });
      expect((await rpc(outsider.token, 'group_preview', { p_code: 'ZZZZZZZZ' })).body).toBeNull();
      expect((await rpc(outsider.token, 'group_preview', { p_code: '' })).body).toBeNull();
      expect((await rpc(KEY ?? '', 'group_preview', { p_code: g2.invite_code })).ok).toBe(false);
      const g3 = await makeGroup(a);
      expect((await rpc(outsider.token, 'group_preview', { p_code: g3.invite_code })).body.placeholders).toEqual([]);
    });

    it('a new member claiming a placeholder takes over everything it had', async () => {
      const [claimer, late] = await Promise.all([signUp(), signUp()]);
      const p = (await rpc(a.token, 'add_placeholder', { p_group: g.id, p_name: 'Gus' })).body.user_id as string;
      expect((await patch(a.token, `expense_groups?id=eq.${g.id}`, { default_shares: { [a.id]: 1, [p]: 2 } })).ok).toBe(true);
      const items = [{ name: 'Cheese', cents: 600, members: [p] }, { name: 'Bread', cents: 400, members: [a.id, p] }];
      const exp = await rpc(a.token, 'save_expense', expenseArgs(g, { [p]: 600, [a.id]: 400 }, { [a.id]: 200, [p]: 800 },
        { p_split_mode: 'itemized', p_items: items }));
      expect(exp.body.payer_id).toBe(p);
      const st = await insert(a.token, 'settlements', { group_id: g.id, from_id: p, to_id: a.id, amount_cents: 100 });
      expect(st.status).toBe(201);
      const rec = await rpc(a.token, 'save_recurring', recurringArgs(g, p, { [a.id]: 1000, [p]: 1000 }));
      expect(rec.ok).toBe(true);

      const joined = await rpc(claimer.token, 'join_group', { p_code: g.invite_code, p_display_name: 'Gus R', p_claim: p });
      expect(joined.ok).toBe(true);
      expect(joined.body.id).toBe(g.id);

      const id = exp.body.id;
      expect((await select(claimer.token, `expenses?id=eq.${id}&select=payer_id,items`)).body).toEqual([{
        payer_id: claimer.id,
        items: [{ name: 'Cheese', cents: 600, members: [claimer.id] }, { name: 'Bread', cents: 400, members: [a.id, claimer.id] }],
      }]);
      expect((await select(claimer.token, `expense_shares?expense_id=eq.${id}&select=user_id,amount_cents&order=amount_cents`)).body)
        .toEqual([{ user_id: a.id, amount_cents: 200 }, { user_id: claimer.id, amount_cents: 800 }]);
      expect((await select(claimer.token, `expense_payers?expense_id=eq.${id}&select=user_id,amount_cents&order=amount_cents`)).body)
        .toEqual([{ user_id: a.id, amount_cents: 400 }, { user_id: claimer.id, amount_cents: 600 }]);
      expect((await select(claimer.token, `settlements?id=eq.${st.body[0].id}&select=from_id`)).body).toEqual([{ from_id: claimer.id }]);
      expect((await select(claimer.token, `recurring_expenses?id=eq.${rec.body.id}&select=payer_id,shares`)).body)
        .toEqual([{ payer_id: claimer.id, shares: { [a.id]: 1000, [claimer.id]: 1000 } }]);
      expect((await select(claimer.token, `expense_groups?id=eq.${g.id}&select=default_shares`)).body)
        .toEqual([{ default_shares: { [a.id]: 1, [claimer.id]: 2 } }]);
      expect((await select(claimer.token, `group_members?group_id=eq.${g.id}&user_id=eq.${claimer.id}&select=display_name,placeholder`)).body)
        .toEqual([{ display_name: 'Gus R', placeholder: false }]);
      expect((await select(a.token, `group_members?group_id=eq.${g.id}&user_id=eq.${p}`)).body).toEqual([]);
      const claimed = (await activity(a.token, g)).filter((r) => r.kind === 'member_claimed');
      expect(claimed).toEqual([{ kind: 'member_claimed', actor_id: claimer.id, ref_id: null,
        detail: { user_id: claimer.id, name: 'Gus R', was: 'Gus' } }]);

      // The spot is gone: a second claim fails and does not leave the late user in the group.
      const again = await rpc(late.token, 'join_group', { p_code: g.invite_code, p_display_name: 'Late', p_claim: p });
      expect(again.body.code).toBe('P0002');
      expect((await select(late.token, `expense_groups?id=eq.${g.id}`)).body).toEqual([]);
      const preview = await rpc(late.token, 'group_preview', { p_code: g.invite_code });
      expect(preview.body.placeholders.map((x: { user_id: string }) => x.user_id)).not.toContain(p);
    });

    it('an existing member cannot claim a placeholder', async () => {
      const p = (await rpc(a.token, 'add_placeholder', { p_group: g.id, p_name: 'Hal' })).body.user_id;
      const res = await rpc(b.token, 'join_group', { p_code: g.invite_code, p_display_name: 'Bo', p_claim: p });
      expect(res.body.code).toBe('23505');
      expect((await select(a.token, `group_members?group_id=eq.${g.id}&user_id=eq.${p}&select=placeholder`)).body)
        .toEqual([{ placeholder: true }]);
    });

    it('claiming a real member or an unknown id fails', async () => {
      const newbie = await signUp();
      for (const p_claim of [a.id, randomUUID()]) {
        const res = await rpc(newbie.token, 'join_group', { p_code: g.invite_code, p_display_name: 'N', p_claim });
        expect(res.body.code).toBe('P0002');
      }
      expect((await select(a.token, `group_members?group_id=eq.${g.id}&user_id=eq.${a.id}&select=user_id`)).body).toHaveLength(1);
    });
  });

  describe('leaving and removing', () => {
    let g: Group;
    let exp: string;
    beforeAll(async () => {
      g = await makeGroup(a, b);
      exp = (await rpc(a.token, 'save_expense', expenseArgs(g, { [a.id]: 1000 }, { [a.id]: 500, [b.id]: 500 }))).body.id;
    });

    it('is refused while the balance is not zero, by anyone', async () => {
      expect((await rpc(b.token, 'remove_member', { p_group: g.id })).body.code).toBe('23514');
      expect((await rpc(a.token, 'remove_member', { p_group: g.id, p_user: b.id })).body.code).toBe('23514');
      expect((await rpc(b.token, 'remove_member', { p_group: g.id, p_user: a.id })).body.code).toBe('23514');
    });

    it('outsiders cannot remove anyone; removing a non-member fails', async () => {
      expect((await rpc(outsider.token, 'remove_member', { p_group: g.id, p_user: b.id })).body.code).toBe('42501');
      expect((await rpc(a.token, 'remove_member', { p_group: g.id, p_user: outsider.id })).body.code).toBe('P0002');
    });

    it('a member at zero leaves, loses access, and their recurring expenses go', async () => {
      expect((await insert(b.token, 'settlements', { group_id: g.id, from_id: b.id, to_id: a.id, amount_cents: 500 })).status).toBe(201);
      const withB = await rpc(a.token, 'save_recurring', recurringArgs(g, a.id, { [a.id]: 500, [b.id]: 500 }));
      const paidByB = await rpc(a.token, 'save_recurring', recurringArgs(g, b.id, { [a.id]: 1000 }));
      const aOnly = await rpc(a.token, 'save_recurring', recurringArgs(g, a.id, { [a.id]: 1000 }));
      expect((await rpc(b.token, 'remove_member', { p_group: g.id })).ok).toBe(true);

      const left = (await select(a.token, `group_members?group_id=eq.${g.id}&user_id=eq.${b.id}&select=left_at`)).body;
      expect(left[0].left_at).not.toBeNull();
      const recurring = (await select(a.token, `recurring_expenses?group_id=eq.${g.id}&select=id`)).body.map((r: { id: string }) => r.id);
      expect(recurring).toEqual([aOnly.body.id]);
      expect(recurring).not.toContain(withB.body.id);
      expect(recurring).not.toContain(paidByB.body.id);

      for (const q of [`expense_groups?id=eq.${g.id}`, `group_members?group_id=eq.${g.id}`, `expenses?group_id=eq.${g.id}`,
        `expense_shares?group_id=eq.${g.id}`, `expense_payers?group_id=eq.${g.id}`, `settlements?group_id=eq.${g.id}`,
        `recurring_expenses?group_id=eq.${g.id}`, `expense_comments?group_id=eq.${g.id}`, `group_activity?group_id=eq.${g.id}`]) {
        expect((await select(b.token, q)).body).toEqual([]);
      }
    });

    it('a member who left cannot write', async () => {
      expect((await rpc(b.token, 'save_expense', expenseArgs(g, { [b.id]: 100 }, { [b.id]: 100 }))).body.code).toBe('42501');
      expect((await insert(b.token, 'settlements', { group_id: g.id, from_id: a.id, to_id: b.id, amount_cents: 1 })).ok).toBe(false);
      expect((await insert(b.token, 'expense_comments', { expense_id: exp, group_id: g.id, body: 'hi' })).ok).toBe(false);
      expect((await rpc(b.token, 'add_placeholder', { p_group: g.id, p_name: 'X' })).body.code).toBe('42501');
      expect((await rpc(b.token, 'delete_expense', { p_id: exp })).body.code).toBe('P0002');
      expect((await rpc(b.token, 'materialize_recurring', { p_group: g.id })).body.code).toBe('42501');
      expect((await rpc(b.token, 'reset_invite', { p_group: g.id })).body.code).toBe('42501');
      expect((await rpc(b.token, 'remove_member', { p_group: g.id })).body.code).toBe('42501');
      expect((await patch(b.token, `expense_groups?id=eq.${g.id}`, { simplify_debts: false })).body).toEqual([]);
      expect((await del(b.token, `settlements?group_id=eq.${g.id}`)).body).toEqual([]);
    });

    it('a member who left cannot be in new shares or payers', async () => {
      expect((await rpc(a.token, 'save_expense', expenseArgs(g, { [a.id]: 1000 }, { [a.id]: 500, [b.id]: 500 }))).body.code).toBe('22023');
      expect((await rpc(a.token, 'save_expense', expenseArgs(g, { [b.id]: 1000 }, { [a.id]: 1000 }))).body.code).toBe('22023');
      expect((await rpc(a.token, 'save_recurring', recurringArgs(g, a.id, { [a.id]: 500, [b.id]: 500 }))).body.code).toBe('22023');
    });

    it('rejoining with the invite code restores access and history', async () => {
      expect((await rpc(b.token, 'join_group', { p_code: g.invite_code, p_display_name: '' })).ok).toBe(true);
      expect((await select(b.token, `group_members?group_id=eq.${g.id}&user_id=eq.${b.id}&select=left_at,display_name`)).body)
        .toEqual([{ left_at: null, display_name: 'M0' }]);
      expect((await select(b.token, `expenses?id=eq.${exp}&select=id`)).body).toHaveLength(1);
      expect((await select(b.token, `expense_shares?expense_id=eq.${exp}&user_id=eq.${b.id}&select=amount_cents`)).body)
        .toEqual([{ amount_cents: 500 }]);
      expect((await select(b.token, `settlements?group_id=eq.${g.id}&select=from_id`)).body).toEqual([{ from_id: b.id }]);
      const kinds = (await activity(b.token, g)).filter((r) => r.detail.user_id === b.id).map((r) => r.kind);
      expect(kinds).toEqual(['member_joined', 'member_left', 'member_joined']);
    });

    it('another member can remove someone at zero', async () => {
      expect((await rpc(a.token, 'remove_member', { p_group: g.id, p_user: b.id })).ok).toBe(true);
      expect((await select(b.token, `expenses?group_id=eq.${g.id}`)).body).toEqual([]);
      expect((await rpc(b.token, 'join_group', { p_code: g.invite_code, p_display_name: 'Bo' })).ok).toBe(true);
    });
  });

  describe('comments', () => {
    let g: Group;
    let other: Group;
    let exp: string;
    let otherExp: string;
    beforeAll(async () => {
      g = await makeGroup(a, b);
      other = await makeGroup(a);
      exp = (await rpc(a.token, 'save_expense', expenseArgs(g, { [a.id]: 1000 }, { [a.id]: 1000 }))).body.id;
      otherExp = (await rpc(a.token, 'save_expense', expenseArgs(other, { [a.id]: 1000 }, { [a.id]: 1000 }))).body.id;
    });

    it('members comment as themselves', async () => {
      const res = await insert(b.token, 'expense_comments', { expense_id: exp, group_id: g.id, body: 'thanks' });
      expect(res.status).toBe(201);
      expect(res.body[0]).toMatchObject({ user_id: b.id, body: 'thanks' });
      expect((await select(a.token, `expense_comments?expense_id=eq.${exp}&select=body`)).body).toEqual([{ body: 'thanks' }]);
    });

    it('nobody comments as someone else, on another group\'s expense, or with a blank body', async () => {
      const asA = await insert(b.token, 'expense_comments', { expense_id: exp, group_id: g.id, body: 'x', user_id: a.id });
      expect(asA.ok).toBe(false);
      expect(asA.body.code).toBe('42501');
      // a is in both groups, but the expense does not belong to the group named.
      expect((await insert(a.token, 'expense_comments', { expense_id: otherExp, group_id: g.id, body: 'x' })).body.code).toBe('42501');
      expect((await insert(b.token, 'expense_comments', { expense_id: otherExp, group_id: other.id, body: 'x' })).body.code).toBe('42501');
      expect((await insert(b.token, 'expense_comments', { expense_id: otherExp, group_id: g.id, body: 'x' })).body.code).toBe('42501');
      expect((await insert(b.token, 'expense_comments', { expense_id: exp, group_id: g.id, body: '   ' })).body.code).toBe('23514');
      expect((await select(a.token, `expense_comments?expense_id=eq.${otherExp}`)).body).toEqual([]);
    });

    it('outsiders cannot read or comment', async () => {
      expect((await select(outsider.token, `expense_comments?expense_id=eq.${exp}`)).body).toEqual([]);
      expect((await insert(outsider.token, 'expense_comments', { expense_id: exp, group_id: g.id, body: 'x' })).ok).toBe(false);
    });

    it('only the author deletes a comment, and nobody edits one', async () => {
      const id = (await insert(b.token, 'expense_comments', { expense_id: exp, group_id: g.id, body: 'mine' })).body[0].id;
      expect((await del(a.token, `expense_comments?id=eq.${id}`)).body).toEqual([]);
      expect((await del(outsider.token, `expense_comments?id=eq.${id}`)).body).toEqual([]);
      expect((await patch(b.token, `expense_comments?id=eq.${id}`, { body: 'edited' })).ok).toBe(false);
      expect((await select(a.token, `expense_comments?id=eq.${id}&select=body`)).body).toEqual([{ body: 'mine' }]);
      expect((await del(b.token, `expense_comments?id=eq.${id}`)).body).toHaveLength(1);
      expect((await select(a.token, `expense_comments?id=eq.${id}`)).body).toEqual([]);
    });
  });

  describe('group settings', () => {
    let g: Group;
    beforeAll(async () => {
      g = await makeGroup(a, b);
    });

    it('members update simplify_debts and default_shares', async () => {
      const res = await patch(b.token, `expense_groups?id=eq.${g.id}`, { simplify_debts: false, default_shares: { [a.id]: 1, [b.id]: 3 } });
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ simplify_debts: false, default_shares: { [a.id]: 1, [b.id]: 3 } });
    });

    it('outsiders cannot', async () => {
      expect((await patch(outsider.token, `expense_groups?id=eq.${g.id}`, { simplify_debts: true })).body).toEqual([]);
      expect((await select(a.token, `expense_groups?id=eq.${g.id}&select=simplify_debts`)).body).toEqual([{ simplify_debts: false }]);
    });

    it('default_shares must be an object; other columns are not writable', async () => {
      for (const default_shares of [[1, 2], 5, 'x']) {
        expect((await patch(a.token, `expense_groups?id=eq.${g.id}`, { default_shares })).body.code).toBe('23514');
      }
      expect((await patch(a.token, `expense_groups?id=eq.${g.id}`, { default_shares: null })).ok).toBe(true);
      expect((await patch(a.token, `expense_groups?id=eq.${g.id}`, { invite_code: 'AAAAAAAA' })).body.code).toBe('42501');
      expect((await patch(b.token, `expense_groups?id=eq.${g.id}`, { created_by: b.id })).body.code).toBe('42501');
    });
  });

  describe('deleting a group', () => {
    it('only the creator can, and everything in it goes cleanly', async () => {
      const g = await makeGroup(a, b);
      const p = (await rpc(a.token, 'add_placeholder', { p_group: g.id, p_name: 'Ivy' })).body.user_id;
      const exp = (await rpc(a.token, 'save_expense', expenseArgs(g, { [a.id]: 600, [p]: 400 }, { [a.id]: 500, [b.id]: 500 }))).body.id;
      const gone = (await rpc(a.token, 'save_expense', expenseArgs(g, { [b.id]: 100 }, { [a.id]: 100 }))).body.id;
      await rpc(a.token, 'delete_expense', { p_id: gone });
      expect((await insert(b.token, 'settlements', { group_id: g.id, from_id: b.id, to_id: a.id, amount_cents: 200 })).status).toBe(201);
      expect((await insert(b.token, 'expense_comments', { expense_id: exp, group_id: g.id, body: 'hi' })).status).toBe(201);
      expect((await rpc(a.token, 'save_recurring', recurringArgs(g, b.id, { [a.id]: 500, [b.id]: 500 }, { p_next_on: daysAgo(3) }))).ok).toBe(true);
      expect(await rpc(a.token, 'materialize_recurring', { p_group: g.id })).toMatchObject({ ok: true, body: 1 });
      await patch(a.token, `expense_groups?id=eq.${g.id}`, { default_shares: { [a.id]: 1 } });

      expect((await del(b.token, `expense_groups?id=eq.${g.id}`)).body).toEqual([]);
      expect((await del(outsider.token, `expense_groups?id=eq.${g.id}`)).body).toEqual([]);
      expect((await select(b.token, `expense_groups?id=eq.${g.id}&select=id`)).body).toHaveLength(1);

      const res = await del(a.token, `expense_groups?id=eq.${g.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      for (const q of [`expense_groups?id=eq.${g.id}`, `group_members?group_id=eq.${g.id}`, `expenses?group_id=eq.${g.id}`]) {
        expect((await select(a.token, q)).body).toEqual([]);
      }
      expect((await rpc(outsider.token, 'join_group', { p_code: g.invite_code, p_display_name: 'x' })).body.code).toBe('P0002');
    });

    it('a creator who left cannot delete it', async () => {
      const g = await makeGroup(a, b);
      expect((await rpc(a.token, 'remove_member', { p_group: g.id })).ok).toBe(true);
      expect((await del(a.token, `expense_groups?id=eq.${g.id}`)).body).toEqual([]);
      expect((await select(b.token, `expense_groups?id=eq.${g.id}&select=id`)).body).toHaveLength(1);
    });
  });

  describe('reset_invite', () => {
    it('gives a new code that works while the old one stops', async () => {
      const g = await makeGroup(a, b);
      const res = await rpc(b.token, 'reset_invite', { p_group: g.id });
      expect(res.ok).toBe(true);
      expect(res.body).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(res.body).not.toBe(g.invite_code);
      expect((await rpc(outsider.token, 'join_group', { p_code: g.invite_code, p_display_name: 'x' })).body.code).toBe('P0002');
      expect((await rpc(outsider.token, 'group_preview', { p_code: g.invite_code })).body).toBeNull();
      const newbie = await signUp();
      expect((await rpc(newbie.token, 'join_group', { p_code: res.body, p_display_name: 'New' })).body.id).toBe(g.id);
      expect((await rpc(outsider.token, 'reset_invite', { p_group: g.id })).body.code).toBe('42501');
      expect((await select(a.token, `expense_groups?id=eq.${g.id}&select=invite_code`)).body).toEqual([{ invite_code: res.body }]);
    });
  });

  describe('activity log', () => {
    it('records every action in order', async () => {
      const g = await makeGroup(a, b);
      const p = (await rpc(a.token, 'add_placeholder', { p_group: g.id, p_name: 'Jo' })).body.user_id;
      const exp = (await rpc(b.token, 'save_expense', expenseArgs(g, { [a.id]: 1000 }, { [a.id]: 500, [b.id]: 500 }))).body.id;
      await rpc(a.token, 'save_expense', expenseArgs(g, { [a.id]: 900 }, { [a.id]: 400, [b.id]: 500 }, { p_id: exp, p_description: 'Food' }));
      await rpc(a.token, 'delete_expense', { p_id: exp });
      await rpc(b.token, 'delete_expense', { p_id: exp, p_restore: true });
      const st = (await insert(b.token, 'settlements', { group_id: g.id, from_id: b.id, to_id: a.id, amount_cents: 300 })).body[0].id;
      expect((await del(a.token, `settlements?id=eq.${st}`)).body).toHaveLength(1);
      await insert(b.token, 'expense_comments', { expense_id: exp, group_id: g.id, body: 'yum' });
      await patch(a.token, `expense_groups?id=eq.${g.id}`, { simplify_debts: false });
      await patch(a.token, `expense_groups?id=eq.${g.id}`, { simplify_debts: false }); // no change, no row
      const rec = (await rpc(a.token, 'save_recurring', recurringArgs(g, a.id, { [a.id]: 1000 }))).body.id;
      expect((await del(b.token, `recurring_expenses?id=eq.${rec}`)).body).toHaveLength(1);
      const claimer = await signUp();
      await rpc(claimer.token, 'join_group', { p_code: g.invite_code, p_display_name: 'Joe', p_claim: p });
      await rpc(claimer.token, 'remove_member', { p_group: g.id });
      await rpc(a.token, 'reset_invite', { p_group: g.id });

      const rows = await activity(a.token, g);
      expect(rows.map((r) => [r.kind, r.actor_id])).toEqual([
        ['member_joined', a.id], ['member_joined', b.id], ['member_added', a.id], ['expense_added', b.id],
        ['expense_edited', a.id], ['expense_deleted', a.id], ['expense_restored', b.id], ['payment_added', b.id],
        ['payment_deleted', a.id], ['comment_added', b.id], ['group_updated', a.id], ['recurring_added', a.id],
        ['recurring_deleted', b.id], ['member_claimed', claimer.id], ['member_left', claimer.id], ['group_updated', a.id],
      ]);
      const by = (k: string) => rows.find((r) => r.kind === k)!;
      expect(by('expense_added')).toMatchObject({ ref_id: exp, detail: { description: 'Groceries', amount_cents: 1000 } });
      expect(by('expense_edited')).toMatchObject({ ref_id: exp, detail: { description: 'Food', amount_cents: 900, old_amount_cents: 1000 } });
      expect(by('expense_deleted').ref_id).toBe(exp);
      expect(by('expense_restored').ref_id).toBe(exp);
      expect(by('payment_added')).toMatchObject({ ref_id: st, detail: { from_id: b.id, to_id: a.id, amount_cents: 300 } });
      expect(by('payment_deleted').ref_id).toBe(st);
      expect(by('member_added').detail).toEqual({ user_id: p, name: 'Jo' });
      expect(by('comment_added')).toMatchObject({ ref_id: exp, detail: { body: 'yum' } });
      expect(by('recurring_added')).toMatchObject({ ref_id: rec, detail: { description: 'Rent', amount_cents: 1000, every: 'monthly' } });
      expect(by('recurring_deleted').ref_id).toBe(rec);
      expect(by('member_left').detail).toEqual({ user_id: claimer.id, name: 'Joe' });
    });

    it('outsiders cannot read it and clients cannot write it', async () => {
      const g = await makeGroup(a);
      expect((await select(outsider.token, `group_activity?group_id=eq.${g.id}`)).body).toEqual([]);
      const row = { group_id: g.id, kind: 'expense_added', detail: {} };
      expect((await insert(a.token, 'group_activity', row)).body.code).toBe('42501');
      expect((await insert(outsider.token, 'group_activity', row)).body.code).toBe('42501');
      expect((await patch(a.token, `group_activity?group_id=eq.${g.id}`, { kind: 'x' })).body.code).toBe('42501');
      expect((await del(a.token, `group_activity?group_id=eq.${g.id}`)).body.code).toBe('42501');
      expect((await activity(a.token, g)).map((r) => r.kind)).toEqual(['member_joined']);
    });
  });

  describe('materialize_recurring', () => {
    it('adds the due expense with its payer row', async () => {
      const g = await makeGroup(a, b);
      const rec = await rpc(a.token, 'save_recurring',
        recurringArgs(g, b.id, { [a.id]: 700, [b.id]: 300 }, { p_every: 'weekly', p_next_on: daysAgo(3) }));
      expect((await rpc(a.token, 'materialize_recurring', { p_group: g.id })).body).toBe(1);
      const rows = (await select(a.token, `expenses?recurring_id=eq.${rec.body.id}&select=id,payer_id,amount_cents`)).body;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ payer_id: b.id, amount_cents: 1000 });
      expect((await select(a.token, `expense_payers?expense_id=eq.${rows[0].id}&select=user_id,amount_cents`)).body)
        .toEqual([{ user_id: b.id, amount_cents: 1000 }]);
      expect((await select(a.token, `expense_shares?expense_id=eq.${rows[0].id}&select=user_id,amount_cents&order=amount_cents`)).body)
        .toEqual([{ user_id: b.id, amount_cents: 300 }, { user_id: a.id, amount_cents: 700 }]);
      expect((await activity(a.token, g)).filter((r) => r.kind === 'expense_added').map((r) => r.ref_id)).toEqual([rows[0].id]);
      expect((await rpc(a.token, 'materialize_recurring', { p_group: g.id })).body).toBe(0);
    });
  });
});
