import { splitAmount } from '@/expenses/split';

/** A person on the lease. percent null means "equal split"; set on anyone, all must total 100. */
export interface Tenant { id: number; name: string; percent: number | null; }
/** A deduction on one changed move-out item. to null: shared by everyone in deposit proportions. */
export interface Deduction { cents: number; to: number | null; }
/** Stored as JSON on the move-out inspection. deductions is keyed by move-out item id. */
export interface DepositSplit { depositCents: number | null; tenants: Tenant[]; deductions: Record<string, Deduction>; }
export interface TenantRefund { id: number; name: string; shareCents: number; deductionCents: number; refundCents: number; }

export const emptySplit = (): DepositSplit => ({ depositCents: null, tenants: [], deductions: {} });

/** Tolerant read of the stored JSON: anything unreadable becomes an empty split. */
export function parseDepositSplit(json: string | null): DepositSplit {
  if (!json) return emptySplit();
  try {
    const v = JSON.parse(json) as Partial<DepositSplit>;
    return { depositCents: v.depositCents ?? null, tenants: v.tenants ?? [], deductions: v.deductions ?? {} };
  } catch {
    return emptySplit();
  }
}

/** True when any tenant has a custom percentage; then all of them must total 100. */
export const isCustom = (tenants: Tenant[]) => tenants.some((t) => t.percent != null);
export const percentTotal = (tenants: Tenant[]) => tenants.reduce((a, t) => a + (t.percent ?? 0), 0);

/** Splits cents across tenants by their percentages (equal when none set). Leftover cents go by largest remainder. */
function byShare(cents: number, tenants: Tenant[]): Record<string, number> {
  const ids = tenants.map((t) => String(t.id));
  return isCustom(tenants)
    ? splitAmount(cents, ids, 'percent', Object.fromEntries(tenants.map((t) => [String(t.id), t.percent ?? 0])))
    : splitAmount(cents, ids, 'equal');
}

/**
 * Each tenant's deposit share minus their deductions, in integer cents. Null when there is no deposit or no tenants
 * (the summary is then omitted). Deductions to an unknown tenant are shared. A refund can go negative when a
 * tenant's deductions exceed their share. Throws when custom percentages do not total 100.
 */
export function settleDeposit(split: DepositSplit, deductions: Deduction[]): TenantRefund[] | null {
  const { depositCents, tenants } = split;
  if (depositCents == null || tenants.length === 0) return null;
  const shares = byShare(depositCents, tenants);
  const ids = new Set(tenants.map((t) => t.id));
  const assigned: Record<string, number> = {};
  let shared = 0;
  for (const d of deductions) {
    if (!Number.isSafeInteger(d.cents) || d.cents < 0) throw new Error(`Deduction must be whole cents, got ${d.cents}`);
    if (d.to != null && ids.has(d.to)) assigned[d.to] = (assigned[d.to] ?? 0) + d.cents;
    else shared += d.cents;
  }
  const sharedParts = byShare(shared, tenants);
  return tenants.map((t) => {
    const deductionCents = (assigned[t.id] ?? 0) + sharedParts[t.id];
    return { id: t.id, name: t.name, shareCents: shares[t.id], deductionCents, refundCents: shares[t.id] - deductionCents };
  });
}

/** Currency-neutral money, e.g. 1234 -> "12.34" (en) or "12,34" (es). */
export const formatMoney = (cents: number, locale?: string) =>
  (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
