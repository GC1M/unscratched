import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import Storage from 'expo-sqlite/kv-store';

import { receiptsConfig } from '@/receipts/config';

import type { Category, Every, ExpenseRow, GroupData, GroupRow, RecurringRow, SettlementRow, SplitModeDb } from './types';

let client: SupabaseClient | null | undefined;

/** The signed-in Supabase client, or null when the build has no Supabase config (shared expenses then stay off). */
export function supabase(): SupabaseClient | null {
  if (client === undefined) {
    const config = receiptsConfig();
    client = config
      ? createClient(config.url, config.anonKey, {
          // Session tokens live in the app's own SQLite key-value store, not in plain files.
          auth: { storage: Storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
        })
      : null;
  }
  return client;
}

function need(): SupabaseClient {
  const s = supabase();
  if (!s) throw new Error('Shared expenses are not set up in this build.');
  return s;
}

/** Throws the Supabase error, if any, so callers can show it. */
function ok<T>({ data, error }: { data?: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/** Emails a 6-digit sign-in code. A new address gets an account. */
export async function sendCode(email: string): Promise<void> {
  ok(await need().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } }));
}

export async function verifyCode(email: string, token: string): Promise<void> {
  ok(await need().auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' }));
}

export async function signOut(): Promise<void> {
  ok(await need().auth.signOut());
}

export async function currentUserId(): Promise<string | null> {
  const s = supabase();
  if (!s) return null;
  return (await s.auth.getSession()).data.session?.user.id ?? null;
}

export async function listGroups(): Promise<GroupRow[]> {
  return ok(await need().from('expense_groups').select('*').order('created_at', { ascending: false })) ?? [];
}

export async function createGroup(name: string, currency: string, displayName: string): Promise<GroupRow> {
  return ok(await need().rpc('create_group', { p_name: name, p_currency: currency, p_display_name: displayName }));
}

export async function joinGroup(code: string, displayName: string): Promise<GroupRow> {
  return ok(await need().rpc('join_group', { p_code: code, p_display_name: displayName }));
}

/** Adds any due recurring expenses, then reads everything the group screen needs. */
export async function loadGroup(groupId: string): Promise<GroupData> {
  const s = need();
  ok(await s.rpc('materialize_recurring', { p_group: groupId }));
  const [group, members, expenses, settlements, recurring] = await Promise.all([
    s.from('expense_groups').select('*').eq('id', groupId).single(),
    s.from('group_members').select('user_id, display_name').eq('group_id', groupId).order('joined_at'),
    s.from('expenses').select('*, expense_shares(user_id, amount_cents)').eq('group_id', groupId)
      .order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
    s.from('settlements').select('*').eq('group_id', groupId).order('settled_on', { ascending: false }),
    s.from('recurring_expenses').select('*').eq('group_id', groupId).order('next_on'),
  ]);
  return {
    group: ok(group) as GroupRow,
    members: ok(members) ?? [],
    expenses: ((ok(expenses) ?? []) as (ExpenseRow & { expense_shares: { user_id: string; amount_cents: number }[] })[]).map(
      ({ expense_shares, ...e }) => ({
        ...e,
        shares: Object.fromEntries(expense_shares.map((sh) => [sh.user_id, Number(sh.amount_cents)])),
        amount_cents: Number(e.amount_cents),
      }),
    ),
    settlements: ((ok(settlements) ?? []) as SettlementRow[]).map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
    recurring: ((ok(recurring) ?? []) as RecurringRow[]).map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
  };
}

export interface ExpenseInput {
  id: string | null;
  groupId: string;
  description: string;
  amountCents: number;
  payerId: string;
  category: Category;
  spentOn: string; // YYYY-MM-DD
  splitMode: SplitModeDb;
  shares: Record<string, number>;
  items: { name: string; cents: number; members: string[] }[] | null;
  receiptPath: string | null;
}

export async function saveExpense(e: ExpenseInput): Promise<ExpenseRow> {
  return ok(
    await need().rpc('save_expense', {
      p_id: e.id, p_group: e.groupId, p_description: e.description, p_amount: e.amountCents, p_payer: e.payerId,
      p_category: e.category, p_spent_on: e.spentOn, p_split_mode: e.splitMode, p_shares: e.shares, p_items: e.items,
      p_receipt_path: e.receiptPath,
    }),
  );
}

export async function deleteExpense(id: string): Promise<void> {
  ok(await need().from('expenses').delete().eq('id', id));
}

export async function recordSettlement(groupId: string, fromId: string, toId: string, amountCents: number): Promise<void> {
  ok(await need().from('settlements').insert({ group_id: groupId, from_id: fromId, to_id: toId, amount_cents: amountCents }));
}

export async function deleteSettlement(id: string): Promise<void> {
  ok(await need().from('settlements').delete().eq('id', id));
}

export async function saveRecurring(
  e: Omit<ExpenseInput, 'id' | 'items' | 'receiptPath' | 'spentOn'> & { every: Every; nextOn: string },
): Promise<void> {
  ok(
    await need().rpc('save_recurring', {
      p_group: e.groupId, p_description: e.description, p_amount: e.amountCents, p_payer: e.payerId, p_category: e.category,
      p_split_mode: e.splitMode, p_shares: e.shares, p_every: e.every, p_next_on: e.nextOn,
    }),
  );
}

export async function deleteRecurring(id: string): Promise<void> {
  ok(await need().from('recurring_expenses').delete().eq('id', id));
}

/** Uploads a JPEG receipt photo into the group's private folder and returns its storage path. */
export async function uploadReceipt(groupId: string, fileUri: string): Promise<string> {
  const path = `${groupId}/${randomUUID()}.jpg`;
  const bytes = await new File(fileUri).bytes();
  ok(await need().storage.from('expense-receipts').upload(path, bytes, { contentType: 'image/jpeg' }));
  return path;
}

/** A short-lived URL for showing a receipt photo. */
export async function receiptUrl(path: string): Promise<string> {
  const signed = ok(await need().storage.from('expense-receipts').createSignedUrl(path, 3600));
  if (!signed) throw new Error('No receipt URL');
  return signed.signedUrl;
}
