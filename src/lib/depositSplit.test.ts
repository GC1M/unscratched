import { formatMoney, parseDepositSplit, settleDeposit, type DepositSplit, type Tenant } from './depositSplit';

const tenants = (...percents: (number | null)[]): Tenant[] => percents.map((percent, i) => ({ id: i + 1, name: `T${i + 1}`, percent }));
const split = (depositCents: number | null, ts: Tenant[]): DepositSplit => ({ depositCents, tenants: ts, deductions: {} });
const refunds = (r: ReturnType<typeof settleDeposit>) => r!.map((x) => x.refundCents);

test('no deposit or no tenants means no summary', () => {
  expect(settleDeposit(split(null, tenants(null)), [])).toBeNull();
  expect(settleDeposit(split(100000, []), [])).toBeNull();
});

test('equal split by default, leftover cents go to the earliest tenants', () => {
  expect(refunds(settleDeposit(split(100000, tenants(null, null)), []))).toEqual([50000, 50000]);
  expect(refunds(settleDeposit(split(100, tenants(null, null, null)), []))).toEqual([34, 33, 33]);
});

test('custom percentages must total 100', () => {
  expect(refunds(settleDeposit(split(100000, tenants(60, 40)), []))).toEqual([60000, 40000]);
  expect(() => settleDeposit(split(100000, tenants(60, 30)), [])).toThrow(/total 100/);
  // A missing percentage counts as 0 once any is custom.
  expect(refunds(settleDeposit(split(100000, tenants(100, null)), []))).toEqual([100000, 0]);
});

test('rounding: shares and shared deductions always add up exactly', () => {
  const r = settleDeposit(split(100001, tenants(33.33, 33.33, 33.34)), [{ cents: 1001, to: null }])!;
  expect(r.reduce((a, x) => a + x.shareCents, 0)).toBe(100001);
  expect(r.reduce((a, x) => a + x.deductionCents, 0)).toBe(1001);
  expect(r.reduce((a, x) => a + x.refundCents, 0)).toBe(100001 - 1001);
});

test('a deduction goes to one tenant or is shared; unknown tenant means shared', () => {
  const r = settleDeposit(split(100000, tenants(null, null)), [
    { cents: 20000, to: 2 },
    { cents: 1000, to: null },
    { cents: 500, to: 99 },
  ])!;
  expect(r.map((x) => x.deductionCents)).toEqual([750, 20750]);
  expect(refunds(r)).toEqual([49250, 29250]);
});

test('deductions larger than a share make the refund negative', () => {
  expect(refunds(settleDeposit(split(100000, tenants(null, null)), [{ cents: 70000, to: 1 }]))).toEqual([-20000, 50000]);
});

test('rejects non-integer deductions', () => {
  expect(() => settleDeposit(split(100, tenants(null)), [{ cents: 1.5, to: null }])).toThrow(/whole cents/);
});

test('parse is tolerant of missing or broken JSON', () => {
  expect(parseDepositSplit(null)).toEqual({ depositCents: null, tenants: [], deductions: {} });
  expect(parseDepositSplit('{oops')).toEqual({ depositCents: null, tenants: [], deductions: {} });
  expect(parseDepositSplit('{"depositCents":5}')).toEqual({ depositCents: 5, tenants: [], deductions: {} });
});

test('formatMoney shows the currency symbol, and null means USD', () => {
  expect(formatMoney(123450, 'USD', 'en')).toBe('$1,234.50');
  expect(formatMoney(123450, 'GBP', 'en')).toBe('£1,234.50');
  expect(formatMoney(123450, 'CAD', 'en')).toBe('CA$1,234.50');
  expect(formatMoney(123450, null, 'en')).toBe('$1,234.50');
  expect(formatMoney(0, 'USD', 'en')).toBe('$0.00');
});
