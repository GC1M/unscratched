export const CATEGORIES = ['general', 'rent', 'utilities', 'groceries', 'household', 'internet', 'dining', 'transport', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export type SplitModeDb = 'equal' | 'exact' | 'percent' | 'shares' | 'itemized';
export type Every = 'weekly' | 'monthly';

export interface GroupRow { id: string; name: string; currency: string; invite_code: string; created_by: string; created_at: string; }
export interface Member { user_id: string; display_name: string; }
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
export interface GroupData {
  group: GroupRow;
  members: Member[];
  expenses: (ExpenseRow & { shares: Record<string, number> })[];
  settlements: SettlementRow[];
  recurring: RecurringRow[];
}
