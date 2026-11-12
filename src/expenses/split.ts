/** How an expense total is divided among members. */
export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares';

/** One expense: who paid, how much, and each member's share in cents (shares sum to amountCents). */
export type Expense = { payerId: string; amountCents: number; shares: Record<string, number> };

/** A payment of amountCents from fromId to toId. */
export type Settlement = { fromId: string; toId: string; amountCents: number };

// Decimal weights (33.33%, 1.5 shares) are scaled to integers so allocation is exact BigInt math.
const WEIGHT_SCALE = 1e6;

const assertCents = (cents: number, label: string) => {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents, got ${cents}`);
  }
};

const assertMembers = (members: string[], label: string) => {
  if (members.length === 0) throw new Error(`${label} must not be empty`);
  if (new Set(members).size !== members.length) throw new Error(`${label} must not contain duplicates`);
};

/**
 * Splits total proportionally to non-negative integer weights by largest remainder.
 * Leftover cents go one at a time to the biggest remainders, ties to the earlier index.
 */
const allocate = (total: number, weights: number[]): number[] => {
  const sum = weights.reduce((a, w) => a + BigInt(w), 0n);
  if (sum === 0n) throw new Error('At least one weight must be greater than zero');
  const parts = weights.map((w) => (BigInt(total) * BigInt(w)) / sum);
  const rems = weights.map((w) => (BigInt(total) * BigInt(w)) % sum);
  let left = total - parts.reduce((a, p) => a + Number(p), 0);
  const order = weights.map((_, i) => i).sort((a, b) => (rems[a] === rems[b] ? a - b : rems[a] > rems[b] ? -1 : 1));
  for (let k = 0; left > 0; k++, left--) parts[order[k]] += 1n;
  return parts.map(Number);
};

const toRecord = (ids: string[], values: number[]) => Object.fromEntries(ids.map((id, i) => [id, values[i]]));

/**
 * Splits totalCents among members. weights are cents for 'exact', percentages for 'percent'
 * (must total 100) and share counts for 'shares'. The result always sums to totalCents.
 */
export function splitAmount(
  totalCents: number,
  members: string[],
  mode: SplitMode,
  weights: Record<string, number> = {},
): Record<string, number> {
  assertCents(totalCents, 'Total');
  assertMembers(members, 'Members');
  for (const id of Object.keys(weights)) {
    if (!members.includes(id)) throw new Error(`Weight given for unknown member ${id}`);
  }
  if (mode === 'equal') return toRecord(members, allocate(totalCents, members.map(() => 1)));

  const raw = members.map((id) => weights[id] ?? 0);
  for (const w of raw) {
    if (!Number.isFinite(w) || w < 0) throw new Error(`Weights must be non-negative numbers, got ${w}`);
  }
  if (mode === 'exact') {
    raw.forEach((c) => assertCents(c, 'Exact amount'));
    const sum = raw.reduce((a, c) => a + c, 0);
    if (sum !== totalCents) throw new Error(`Exact amounts sum to ${sum} but the total is ${totalCents}`);
    return toRecord(members, raw);
  }
  if (mode === 'percent') {
    const sum = raw.reduce((a, p) => a + p, 0);
    if (Math.abs(sum - 100) > 1e-9) throw new Error(`Percentages must total 100, got ${sum}`);
  } else if (mode === 'shares') {
    if (!raw.some((s) => s > 0)) throw new Error('At least one member must have shares greater than zero');
  } else {
    throw new Error(`Unknown split mode ${String(mode)}`);
  }
  return toRecord(members, allocate(totalCents, raw.map((w) => Math.round(w * WEIGHT_SCALE))));
}

/**
 * Splits each item equally among its members, then splits extrasCents (tax + tip) in proportion
 * to each person's item subtotal. Everyone in `everyone` appears in the result, 0 if they had nothing.
 */
export function splitItemized(
  items: { cents: number; members: string[] }[],
  extrasCents: number,
  everyone: string[],
): Record<string, number> {
  assertMembers(everyone, 'Everyone');
  assertCents(extrasCents, 'Extras');
  const subtotals = everyone.map(() => 0);
  for (const item of items) {
    assertCents(item.cents, 'Item amount');
    assertMembers(item.members, 'Item members');
    const idx = item.members.map((id) => {
      const i = everyone.indexOf(id);
      if (i < 0) throw new Error(`Item member ${id} is not in the group`);
      return i;
    });
    idx.sort((a, b) => a - b);
    allocate(item.cents, idx.map(() => 1)).forEach((c, k) => (subtotals[idx[k]] += c));
  }
  if (extrasCents > 0 && subtotals.every((s) => s === 0)) {
    throw new Error('Extras need at least one item with a non-zero amount to split against');
  }
  const extras = extrasCents > 0 ? allocate(extrasCents, subtotals) : subtotals.map(() => 0);
  return toRecord(everyone, subtotals.map((s, i) => s + extras[i]));
}

/** Net balance per member: positive is owed money, negative owes. Every id seen is included. */
export function balances(expenses: Expense[], settlements: Settlement[]): Record<string, number> {
  const bal: Record<string, number> = {};
  const add = (id: string, cents: number) => (bal[id] = (bal[id] ?? 0) + cents);
  for (const e of expenses) {
    assertCents(e.amountCents, 'Expense amount');
    let sum = 0;
    add(e.payerId, e.amountCents);
    for (const [id, share] of Object.entries(e.shares)) {
      assertCents(share, 'Share');
      sum += share;
      add(id, -share);
    }
    if (sum !== e.amountCents) throw new Error(`Expense shares sum to ${sum} but the amount is ${e.amountCents}`);
  }
  for (const s of settlements) {
    assertCents(s.amountCents, 'Settlement amount');
    add(s.fromId, s.amountCents);
    add(s.toId, -s.amountCents);
  }
  return bal;
}

/**
 * Greedy debt simplification: repeatedly pays the largest creditor from the largest debtor
 * (ties by id). Applying the result as settlements zeroes every balance.
 */
export function simplifyDebts(bal: Record<string, number>): Settlement[] {
  const left = { ...bal };
  let sum = 0;
  for (const v of Object.values(left)) {
    if (!Number.isSafeInteger(v)) throw new Error(`Balances must be integer cents, got ${v}`);
    sum += v;
  }
  if (sum !== 0) throw new Error(`Balances must sum to 0, got ${sum}`);
  const pick = (sign: 1 | -1) =>
    Object.keys(left)
      .filter((id) => left[id] * sign > 0)
      .sort((a, b) => left[b] * sign - left[a] * sign || (a < b ? -1 : 1))[0];
  const out: Settlement[] = [];
  // ponytail: O(n^2) re-sort per step, fine for household-sized groups.
  for (let creditor = pick(1); creditor !== undefined; creditor = pick(1)) {
    const debtor = pick(-1);
    const amountCents = Math.min(left[creditor], -left[debtor]);
    out.push({ fromId: debtor, toId: creditor, amountCents });
    left[creditor] -= amountCents;
    left[debtor] += amountCents;
  }
  return out;
}

/** Formats integer cents as a localized currency string, e.g. formatCents(1234, 'USD', 'en-US') -> "$12.34". */
export function formatCents(cents: number, currency: string, locale?: string): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`Cents must be an integer, got ${cents}`);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

const MONEY_RE = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{0,2}))?$/;

/**
 * Parses user-typed money ("12", "12.5", "1,234.56", " $4.07 ") into cents using string math only.
 * Returns null for empty, negative, more than two decimals, or anything else unparseable.
 */
export function parseCents(text: string): number | null {
  const m = MONEY_RE.exec(text.trim());
  if (!m) return null;
  const whole = m[1].replace(/,/g, '');
  const frac = m[2] ?? '';
  if (whole === '' && frac === '') return null;
  const cents = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
