import type { GroupData } from './types';

type Expenses = GroupData['expenses'];

/** Expenses whose description, category, or payer name contains every word of the query (case-insensitive). */
export function searchExpenses(expenses: Expenses, query: string, names: Record<string, string>): Expenses {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return expenses;
  return expenses.filter((e) => {
    const hay = `${e.description} ${e.category} ${names[e.payer_id] ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Total cents per key, largest first. */
function totals(expenses: Expenses, key: (e: Expenses[number]) => string): { key: string; cents: number }[] {
  const sums = new Map<string, number>();
  for (const e of expenses) sums.set(key(e), (sums.get(key(e)) ?? 0) + e.amount_cents);
  return [...sums].map(([k, cents]) => ({ key: k, cents }));
}

export const byCategory = (expenses: Expenses) => totals(expenses, (e) => e.category).sort((a, b) => b.cents - a.cents);

/** Totals per YYYY-MM, oldest first, at most the last `months` months that have spending. */
export const byMonth = (expenses: Expenses, months = 6) =>
  totals(expenses, (e) => e.spent_on.slice(0, 7))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-months);

/** What each member's own share adds up to (their spending, not what they paid). */
export function spentPerMember(expenses: Expenses): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of expenses) for (const [id, cents] of Object.entries(e.shares)) out[id] = (out[id] ?? 0) + cents;
  return out;
}

const cell = (v: string) => (/[",\n\r]/.test(v) || /^[=+\-@\t]/.test(v) ? `"${(/^[=+\-@\t]/.test(v) ? "'" : '') + v.replace(/"/g, '""')}"` : v);
const money = (cents: number) => (cents / 100).toFixed(2);

/**
 * CSV of every expense and settlement, one column per member for their share. Cells starting with = + - @ are
 * quoted and prefixed with ' so a spreadsheet does not run them as formulas.
 */
export function toCsv({ group, members, expenses, settlements }: GroupData): string {
  const name = Object.fromEntries(members.map((m) => [m.user_id, m.display_name]));
  const header = ['Date', 'Type', 'Description', 'Category', `Amount (${group.currency})`, 'Paid by', ...members.map((m) => m.display_name)];
  const rows = [
    ...expenses.map((e) => ({
      date: e.spent_on,
      cells: [e.spent_on, 'Expense', e.description, e.category, money(e.amount_cents), name[e.payer_id] ?? '',
        ...members.map((m) => money(e.shares[m.user_id] ?? 0))],
    })),
    ...settlements.map((s) => ({
      date: s.settled_on,
      cells: [s.settled_on, 'Payment', `${name[s.from_id] ?? ''} paid ${name[s.to_id] ?? ''}`, '', money(s.amount_cents),
        name[s.from_id] ?? '', ...members.map(() => '')],
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return [header, ...rows.map((r) => r.cells)].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
