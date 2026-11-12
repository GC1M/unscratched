export const CATEGORIES = ['general', 'rent', 'utilities', 'groceries', 'household', 'internet', 'dining', 'transport', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export type SplitModeDb = 'equal' | 'exact' | 'percent' | 'shares' | 'adjust' | 'itemized';
export type Every = 'weekly' | 'monthly';

export interface GroupRow {
  id: string;
  name: string;
  currency: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  simplify_debts: boolean;
  default_shares: Record<string, number> | null;
}
/** placeholder: added by name, not signed up yet. left_at: a former member, kept for history. */
export interface Member { user_id: string; display_name: string; placeholder: boolean; left_at: string | null; }
export interface ExpenseRow {
  id: string;
  group_id: string;
  description: string;
  amount_cents: number;
  payer_id: string;
  category: Category;
  spent_on: string; // YYYY-MM-DD
  split_mode: SplitModeDb;
  items: { name: string; cents: number; members: string[] }[] | null;
  receipt_path: string | null;
  recurring_id: string | null;
  notes: string | null;
  original_currency: string | null;
  original_amount_cents: number | null;
  deleted_at: string | null;
  created_by: string;
  created_at: string;
}
export interface SettlementRow { id: string; group_id: string; from_id: string; to_id: string; amount_cents: number; settled_on: string; created_at: string; }
export interface RecurringRow {
  id: string;
  group_id: string;
  description: string;
  amount_cents: number;
  payer_id: string;
  category: Category;
  split_mode: SplitModeDb;
  shares: Record<string, number>;
  every: Every;
  next_on: string;
}
export interface CommentRow { id: string; expense_id: string; user_id: string; body: string; created_at: string; }
export interface ActivityRow {
  id: number;
  actor_id: string | null;
  kind: string;
  ref_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}
export type GroupExpense = ExpenseRow & { shares: Record<string, number>; payers: Record<string, number> };
export interface GroupData {
  group: GroupRow;
  /** Current members first (in join order), then former members. */
  members: Member[];
  /** Live expenses; deleted ones are in `deleted`. */
  expenses: GroupExpense[];
  deleted: GroupExpense[];
  settlements: SettlementRow[];
  recurring: RecurringRow[];
}
