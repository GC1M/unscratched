import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import Storage from 'expo-sqlite/kv-store';

import { receiptsConfig } from '@/receipts/config';

import type {
  ActivityRow, Category, CommentRow, Every, ExpenseRow, GroupData, GroupExpense, GroupRow, RecurringRow, SettlementRow, SplitModeDb,
} from './types';

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

export interface GroupPreview { id: string; name: string; currency: string; placeholders: { user_id: string; display_name: string }[] }

/** The group behind an invite code and the spots added for people not signed up yet, or null for an unknown code. */
export async function groupPreview(code: string): Promise<GroupPreview | null> {
  return ok(await need().rpc('group_preview', { p_code: code })) ?? null;
}

/** Joins with an invite code; claim takes over a placeholder spot with its expenses and payments. */
export async function joinGroup(code: string, displayName: string, claim: string | null = null): Promise<GroupRow> {
  return ok(await need().rpc('join_group', { p_code: code, p_display_name: displayName, p_claim: claim }));
}

/** Adds any due recurring expenses, then reads everything the group screen needs. */
export async function loadGroup(groupId: string): Promise<GroupData> {
  const s = need();
  ok(await s.rpc('materialize_recurring', { p_group: groupId }));
  const [group, members, expenses, settlements, recurring] = await Promise.all([
    s.from('expense_groups').select('*').eq('id', groupId).single(),
    s.from('group_members').select('user_id, display_name, placeholder, left_at').eq('group_id', groupId)
      .order('left_at', { nullsFirst: true }).order('joined_at'),
    s.from('expenses').select('*, expense_shares(user_id, amount_cents), expense_payers(user_id, amount_cents)').eq('group_id', groupId)
      .order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
    s.from('settlements').select('*').eq('group_id', groupId).order('settled_on', { ascending: false }),
    s.from('recurring_expenses').select('*').eq('group_id', groupId).order('next_on'),
  ]);
  type Part = { user_id: string; amount_cents: number };
  const cents = (parts: Part[]) => Object.fromEntries(parts.map((p) => [p.user_id, Number(p.amount_cents)]));
  const all: GroupExpense[] = ((ok(expenses) ?? []) as (ExpenseRow & { expense_shares: Part[]; expense_payers: Part[] })[]).map(
    ({ expense_shares, expense_payers, ...e }) => ({
      ...e,
      shares: cents(expense_shares),
      payers: cents(expense_payers),
      amount_cents: Number(e.amount_cents),
      original_amount_cents: e.original_amount_cents == null ? null : Number(e.original_amount_cents),
    }),
  );
  return {
    group: ok(group) as GroupRow,
    members: ok(members) ?? [],
    expenses: all.filter((e) => !e.deleted_at),
    deleted: all.filter((e) => e.deleted_at).sort((a, b) => b.deleted_at!.localeCompare(a.deleted_at!)),
    settlements: ((ok(settlements) ?? []) as SettlementRow[]).map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
    recurring: ((ok(recurring) ?? []) as RecurringRow[]).map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
  };
}

export interface ExpenseInput {
  id: string | null;
  groupId: string;
  description: string;
  amountCents: number;
  /** Cents per payer, adding up to amountCents. */
  payers: Record<string, number>;
  category: Category;
  spentOn: string; // YYYY-MM-DD
  splitMode: SplitModeDb;
  shares: Record<string, number>;
  items: { name: string; cents: number; members: string[] }[] | null;
  receiptPath: string | null;
  notes: string | null;
  /** What was typed when the expense was in another currency; amountCents is the converted amount. */
  original: { currency: string; cents: number } | null;
}

export async function saveExpense(e: ExpenseInput): Promise<ExpenseRow> {
  return ok(
    await need().rpc('save_expense', {
      p_id: e.id, p_group: e.groupId, p_description: e.description, p_amount: e.amountCents, p_payers: e.payers,
      p_category: e.category, p_spent_on: e.spentOn, p_split_mode: e.splitMode, p_shares: e.shares, p_items: e.items,
      p_receipt_path: e.receiptPath, p_notes: e.notes, p_original_currency: e.original?.currency ?? null,
      p_original_amount: e.original?.cents ?? null,
    }),
  );
}

/** Moves an expense to Recently deleted (restore: back again). */
export async function deleteExpense(id: string, restore = false): Promise<void> {
  ok(await need().rpc('delete_expense', { p_id: id, p_restore: restore }));
}

/** Today as YYYY-MM-DD in the phone's time zone (the server's current_date is UTC). */
export const localToday = () => new Date().toLocaleDateString('sv-SE');

export async function recordSettlement(
  groupId: string, fromId: string, toId: string, amountCents: number, settledOn = localToday(),
): Promise<void> {
  ok(
    await need()
      .from('settlements')
      .insert({ group_id: groupId, from_id: fromId, to_id: toId, amount_cents: amountCents, settled_on: settledOn }),
  );
}

export async function deleteSettlement(id: string): Promise<void> {
  ok(await need().from('settlements').delete().eq('id', id));
}

export async function saveRecurring(
  e: Omit<ExpenseInput, 'id' | 'items' | 'receiptPath' | 'spentOn' | 'payers' | 'notes' | 'original'> & {
    payerId: string;
    every: Every;
    nextOn: string;
  },
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

export async function listComments(expenseId: string): Promise<CommentRow[]> {
  return ok(await need().from('expense_comments').select('*').eq('expense_id', expenseId).order('created_at')) ?? [];
}

export async function addComment(groupId: string, expenseId: string, body: string): Promise<void> {
  ok(await need().from('expense_comments').insert({ group_id: groupId, expense_id: expenseId, body: body.trim() }));
}

export async function deleteComment(id: string): Promise<void> {
  ok(await need().from('expense_comments').delete().eq('id', id));
}

/** The latest 100 things that happened in the group, newest first. */
export async function listActivity(groupId: string): Promise<ActivityRow[]> {
  return ok(await need().from('group_activity').select('*').eq('group_id', groupId).order('id', { ascending: false }).limit(100)) ?? [];
}

let watchers = 0;

/** Calls onChange whenever something happens in the group on another phone (or this one). Returns the unsubscribe. */
export function watchGroup(groupId: string, onChange: () => void): () => void {
  const s = supabase();
  if (!s) return () => {};
  // Each screen gets its own channel: supabase-js hands back an existing channel with the same name, and adding a
  // listener to one that is already subscribed throws.
  const channel = s
    .channel(`group-${groupId}-${++watchers}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_activity', filter: `group_id=eq.${groupId}` }, onChange)
    .subscribe();
  return () => {
    s.removeChannel(channel);
  };
}

export async function addPlaceholder(groupId: string, name: string): Promise<void> {
  ok(await need().rpc('add_placeholder', { p_group: groupId, p_name: name }));
}

/** Leaves the group (userId omitted) or removes another member. The server refuses unless their balance is zero. */
export async function removeMember(groupId: string, userId: string | null = null): Promise<void> {
  ok(await need().rpc('remove_member', { p_group: groupId, p_user: userId }));
}

export async function resetInvite(groupId: string): Promise<string> {
  return ok(await need().rpc('reset_invite', { p_group: groupId }));
}

export async function updateGroup(
  groupId: string,
  patch: Partial<{ name: string; simplify_debts: boolean; default_shares: Record<string, number> | null }>,
): Promise<void> {
  ok(await need().from('expense_groups').update(patch).eq('id', groupId));
}

export async function renameMe(groupId: string, displayName: string): Promise<void> {
  const me = await currentUserId();
  ok(await need().from('group_members').update({ display_name: displayName.trim() }).eq('group_id', groupId).eq('user_id', me ?? ''));
}

/** Deletes the group and everything in it. Only its creator can. */
export async function deleteGroup(groupId: string): Promise<void> {
  const rows = ok(await need().from('expense_groups').delete().eq('id', groupId).select('id'));
  if (!rows?.length) throw new Error('Only the person who made this group can delete it.');
}

/**
 * How many units of `to` one unit of `from` buys today, from the European Central Bank's reference rates (frankfurter.dev,
 * no key). Only the two currency codes leave the phone.
 */
export async function exchangeRate(from: string, to: string): Promise<number> {
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  if (!res.ok) throw new Error(`No exchange rate for ${from} to ${to}`);
  const rate = (await res.json())?.rates?.[to];
  if (typeof rate !== 'number') throw new Error(`No exchange rate for ${from} to ${to}`);
  return rate;
}
