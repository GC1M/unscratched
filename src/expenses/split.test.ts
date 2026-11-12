import { balances, type Expense, formatCents, pairwiseDebts, parseCents, Settlement, simplifyDebts, splitAmount, splitItemized } from './split';

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, c) => a + c, 0);

const apply = (bal: Record<string, number>, settlements: Settlement[]) => {
  const out = { ...bal };
  for (const s of settlements) {
    out[s.fromId] += s.amountCents;
    out[s.toId] -= s.amountCents;
  }
  return out;
};

describe('splitAmount', () => {
  it('gives leftover cents to members in order', () => {
    expect(splitAmount(1000, ['a', 'b', 'c'], 'equal')).toEqual({ a: 334, b: 333, c: 333 });
    expect(splitAmount(1001, ['c', 'b', 'a'], 'equal')).toEqual({ c: 334, b: 334, a: 333 });
    expect(splitAmount(0, ['a', 'b'], 'equal')).toEqual({ a: 0, b: 0 });
  });

  it('splits by decimal percentages', () => {
    const r = splitAmount(10000, ['a', 'b', 'c'], 'percent', { a: 33.33, b: 33.33, c: 33.34 });
    expect(r).toEqual({ a: 3333, b: 3333, c: 3334 });
    const odd = splitAmount(1000, ['a', 'b', 'c'], 'percent', { a: 33.33, b: 33.33, c: 33.34 });
    expect(sum(odd)).toBe(1000);
    expect(odd).toEqual({ a: 333, b: 333, c: 334 });
  });

  it('splits by shares, 0 shares excluded', () => {
    expect(splitAmount(900, ['a', 'b'], 'shares', { a: 1, b: 2 })).toEqual({ a: 300, b: 600 });
    expect(splitAmount(1000, ['a', 'b', 'c'], 'shares', { a: 1, b: 2, c: 0 })).toEqual({ a: 333, b: 667, c: 0 });
  });

  it('passes exact amounts through and rejects mismatches', () => {
    expect(splitAmount(500, ['a', 'b'], 'exact', { a: 500, b: 0 })).toEqual({ a: 500, b: 0 });
    expect(() => splitAmount(500, ['a', 'b'], 'exact', { a: 200, b: 200 })).toThrow(/sum to 400/);
    expect(() => splitAmount(500, ['a', 'b'], 'exact', { a: 250.5, b: 249.5 })).toThrow(/integer/);
  });

  it('rejects invalid input', () => {
    expect(() => splitAmount(1.5, ['a'], 'equal')).toThrow(/integer/);
    expect(() => splitAmount(-1, ['a'], 'equal')).toThrow(/non-negative/);
    expect(() => splitAmount(100, [], 'equal')).toThrow(/empty/);
    expect(() => splitAmount(100, ['a', 'b'], 'percent', { a: 50, b: 49.99 })).toThrow(/100/);
    expect(() => splitAmount(100, ['a', 'b'], 'shares', { a: 0, b: 0 })).toThrow(/greater than zero/);
    expect(() => splitAmount(100, ['a', 'b'], 'shares', { a: -1, b: 2 })).toThrow(/non-negative/);
    expect(() => splitAmount(100, ['a'], 'shares', { z: 1 })).toThrow(/unknown member/);
  });
});

describe('splitItemized', () => {
  it('splits items equally and extras by subtotal, with a person who had nothing', () => {
    const r = splitItemized(
      [
        { cents: 2000, members: ['a'] },
        { cents: 1000, members: ['a', 'b'] },
      ],
      500,
      ['a', 'b', 'c'],
    );
    // subtotals a=2500, b=500; extras 500 split 5:1 -> 416.67 / 83.33 -> 417 / 83
    expect(r).toEqual({ a: 2917, b: 583, c: 0 });
    expect(sum(r)).toBe(3500);
  });

  it('works with no extras and rejects unknown members', () => {
    expect(splitItemized([{ cents: 1001, members: ['b', 'a'] }], 0, ['a', 'b'])).toEqual({ a: 501, b: 500 });
    expect(() => splitItemized([{ cents: 100, members: ['x'] }], 0, ['a'])).toThrow(/not in the group/);
    expect(() => splitItemized([], 100, ['a'])).toThrow(/Extras/);
  });
});

describe('balances', () => {
  it('nets expenses and settlements', () => {
    const bal = balances(
      [
        { payerId: 'a', amountCents: 900, shares: { a: 300, b: 300, c: 300 } },
        { payerId: 'b', amountCents: 300, shares: { c: 300 } },
      ],
      [{ fromId: 'c', toId: 'a', amountCents: 200 }],
    );
    expect(bal).toEqual({ a: 400, b: 0, c: -400 });
  });

  it('rejects shares that do not sum to the amount', () => {
    expect(() => balances([{ payerId: 'a', amountCents: 100, shares: { a: 60 } }], [])).toThrow(/sum to 60/);
  });
});

describe('simplifyDebts', () => {
  const cases: Record<string, number>[] = [
    { a: 400, b: 0, c: -400 },
    { a: 500, b: -200, c: -300 },
    { a: 300, b: 300, c: -100, d: -500 },
    { a: -1, b: -1, c: 1, d: 1 },
  ];

  it.each(cases)('zeroes balances when applied (%o)', (bal) => {
    const out = simplifyDebts(bal);
    expect(Object.values(apply(bal, out)).every((v) => v === 0)).toBe(true);
    expect(out.every((s) => s.amountCents > 0)).toBe(true);
  });

  it('is deterministic: largest debtor pays largest creditor, ties by id', () => {
    expect(simplifyDebts({ a: 300, b: 300, c: -100, d: -500 })).toEqual([
      { fromId: 'd', toId: 'a', amountCents: 300 },
      { fromId: 'd', toId: 'b', amountCents: 200 },
      { fromId: 'c', toId: 'b', amountCents: 100 },
    ]);
    expect(simplifyDebts({ a: 0 })).toEqual([]);
  });

  it('throws on non-zero-sum input', () => {
    expect(() => simplifyDebts({ a: 100, b: -99 })).toThrow(/sum to 0/);
  });
});

describe('formatCents', () => {
  it('formats as currency', () => {
    expect(formatCents(123456, 'USD', 'en-US')).toBe('$1,234.56');
  });
});

describe('parseCents', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['1,234.56', 123456],
    [' $4.07 ', 407],
    ['4.07', 407],
    ['0.1', 10],
    ['.5', 50],
    ['0', 0],
  ])('parses %p as %p', (text, cents) => {
    expect(parseCents(text)).toBe(cents);
  });

  it.each(['', '  ', '-5', '1.234', 'abc', '12a', '1,23', '.', '$'])('rejects %p', (text) => {
    expect(parseCents(text)).toBeNull();
  });
});

describe('adjust split', () => {
  it('adds each adjustment on top of an equal split of what is left', () => {
    // $30 with Ana +$6: the other $24 splits three ways.
    expect(splitAmount(3000, ['a', 'b', 'c'], 'adjust', { a: 600 })).toEqual({ a: 1400, b: 800, c: 800 });
    expect(splitAmount(1000, ['a', 'b', 'c'], 'adjust', { b: -100 })).toEqual({ a: 367, b: 267, c: 366 });
    expect(splitAmount(1000, ['a', 'b'], 'adjust', {})).toEqual({ a: 500, b: 500 });
  });

  it('refuses adjustments past the total, discounts below zero, and fractional cents', () => {
    expect(() => splitAmount(1000, ['a', 'b'], 'adjust', { a: 1100 })).toThrow('more than the total');
    expect(() => splitAmount(1000, ['a', 'b'], 'adjust', { a: -1100 })).toThrow('bigger than');
    expect(() => splitAmount(1000, ['a', 'b'], 'adjust', { a: 1.5 })).toThrow('whole cents');
  });
});

describe('several payers', () => {
  it('credits each payer with what they paid', () => {
    const e = { payerId: 'a', payers: { a: 600, b: 400 }, amountCents: 1000, shares: { a: 500, b: 500 } };
    expect(balances([e], [])).toEqual({ a: 100, b: -100 });
  });

  it('refuses payers that do not add up', () => {
    const e = { payerId: 'a', payers: { a: 600, b: 300 }, amountCents: 1000, shares: { a: 500, b: 500 } };
    expect(() => balances([e], [])).toThrow('Payers must add up');
  });
});

describe('pairwiseDebts', () => {
  it('keeps who owes whom without routing through a third person', () => {
    // a paid 30 for a,b,c; b paid 30 for b,c. Simplified, c pays a 20 and b pays... pairwise keeps c owing b.
    const ex: Expense[] = [
      { payerId: 'a', amountCents: 3000, shares: { a: 1000, b: 1000, c: 1000 } },
      { payerId: 'b', amountCents: 3000, shares: { b: 1500, c: 1500 } },
    ];
    expect(pairwiseDebts(ex, [])).toEqual([
      { fromId: 'c', toId: 'b', amountCents: 1500 },
      { fromId: 'b', toId: 'a', amountCents: 1000 },
      { fromId: 'c', toId: 'a', amountCents: 1000 },
    ]);
  });

  it('nets opposite debts, applies payments, and splits a share across several payers', () => {
    const ex: Expense[] = [
      { payerId: 'a', amountCents: 1000, shares: { a: 500, b: 500 } },
      { payerId: 'b', amountCents: 400, shares: { a: 200, b: 200 } },
      { payerId: 'a', payers: { a: 300, c: 100 }, amountCents: 400, shares: { b: 400 } },
    ];
    // b owes a 500 - 200 + 300 = 600 and owes c 100; b paid a 600 already.
    expect(pairwiseDebts(ex, [{ fromId: 'b', toId: 'a', amountCents: 600 }])).toEqual([{ fromId: 'b', toId: 'c', amountCents: 100 }]);
    // Overpaying flips the direction.
    expect(pairwiseDebts(ex, [{ fromId: 'b', toId: 'a', amountCents: 700 }])).toEqual([
      { fromId: 'a', toId: 'b', amountCents: 100 },
      { fromId: 'b', toId: 'c', amountCents: 100 },
    ]);
  });

  it('agrees with balances: every member nets out the same', () => {
    const ex: Expense[] = [
      { payerId: 'a', payers: { a: 700, c: 333 }, amountCents: 1033, shares: { a: 344, b: 344, c: 345 } },
      { payerId: 'b', amountCents: 999, shares: { a: 333, c: 666 } },
    ];
    const st = [{ fromId: 'c', toId: 'b', amountCents: 50 }];
    const net: Record<string, number> = {};
    for (const d of pairwiseDebts(ex, st)) {
      net[d.fromId] = (net[d.fromId] ?? 0) - d.amountCents;
      net[d.toId] = (net[d.toId] ?? 0) + d.amountCents;
    }
    const bal = balances(ex, st);
    for (const id of Object.keys(bal)) expect(net[id] ?? 0).toBe(bal[id]);
  });
});
