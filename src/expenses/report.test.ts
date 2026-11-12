import { byCategory, byMonth, paidPerMember, searchExpenses, spentPerMember, toCsv } from './report';
import type { GroupData } from './types';

const expense = (over: Partial<GroupData['expenses'][number]>): GroupData['expenses'][number] => ({
  id: 'e', group_id: 'g', description: 'Milk', amount_cents: 1000, payer_id: 'a', category: 'groceries', spent_on: '2026-10-05',
  split_mode: 'equal', items: null, receipt_path: null, recurring_id: null, created_by: 'a', created_at: '', shares: { a: 500, b: 500 },
  notes: null, original_currency: null, original_amount_cents: null, deleted_at: null,
  ...over,
  payers: over.payers ?? { [over.payer_id ?? 'a']: over.amount_cents ?? 1000 },
});

const data: GroupData = {
  group: { id: 'g', name: 'Flat', currency: 'USD', invite_code: 'X', created_by: 'a', created_at: '', simplify_debts: true, default_shares: null },
  members: [{ user_id: 'a', display_name: 'Ana', placeholder: false, left_at: null }, { user_id: 'b', display_name: 'Bo', placeholder: false, left_at: null }],
  expenses: [
    expense({}),
    expense({ id: 'r', description: '=HYPERLINK("x")', category: 'rent', amount_cents: 150000, spent_on: '2026-11-01', payer_id: 'b',
      shares: { a: 75000, b: 75000 } }),
    expense({ id: 'u', description: 'Power, gas', category: 'utilities', amount_cents: 333, spent_on: '2026-09-30', shares: { a: 333 } }),
  ],
  settlements: [{ id: 's', group_id: 'g', from_id: 'b', to_id: 'a', amount_cents: 500, settled_on: '2026-10-06', created_at: '' }],
  recurring: [],
  deleted: [],
};
const names = { a: 'Ana', b: 'Bo' };

test('search matches every word across description, category, and payer name', () => {
  expect(searchExpenses(data.expenses, '', names)).toHaveLength(3);
  expect(searchExpenses(data.expenses, 'GROCERIES ana', names).map((e) => e.id)).toEqual(['e']);
  expect(searchExpenses(data.expenses, 'bo rent', names).map((e) => e.id)).toEqual(['r']);
  expect(searchExpenses(data.expenses, 'milk bo', names)).toEqual([]);
});

test('totals by category (largest first) and by month (oldest first, capped)', () => {
  expect(byCategory(data.expenses)).toEqual([
    { key: 'rent', cents: 150000 }, { key: 'groceries', cents: 1000 }, { key: 'utilities', cents: 333 },
  ]);
  expect(byMonth(data.expenses)).toEqual([
    { key: '2026-09', cents: 333 }, { key: '2026-10', cents: 1000 }, { key: '2026-11', cents: 150000 },
  ]);
  expect(byMonth(data.expenses, 1)).toEqual([{ key: '2026-11', cents: 150000 }]);
});

test('spending per member sums their shares', () => {
  expect(spentPerMember(data.expenses)).toEqual({ a: 75833, b: 75500 });
});

test('CSV lists expenses and payments by date, quotes commas, and defuses formulas', () => {
  expect(toCsv(data).split('\r\n')).toEqual([
    'Date,Type,Description,Category,Amount (USD),Paid by,Ana,Bo,Notes',
    '2026-09-30,Expense,"Power, gas",utilities,3.33,Ana,3.33,0.00,',
    '2026-10-05,Expense,Milk,groceries,10.00,Ana,5.00,5.00,',
    '2026-10-06,Payment,Bo paid Ana,,5.00,Bo,,,',
    `2026-11-01,Expense,"'=HYPERLINK(""x"")",rent,1500.00,Bo,750.00,750.00,`,
    '',
  ]);
});

test('CSV lists each payer when several paid, and notes; search finds notes and any payer', () => {
  const several = expense({ id: 'm', description: 'Dinner', payers: { a: 600, b: 400 }, notes: 'Birthday' });
  const csv = toCsv({ ...data, expenses: [several], settlements: [] }).split('\r\n');
  expect(csv[1]).toBe('2026-10-05,Expense,Dinner,groceries,10.00,Ana 6.00; Bo 4.00,5.00,5.00,Birthday');
  const names = { a: 'Ana', b: 'Bo' };
  expect(searchExpenses([several], 'birthday', names)).toHaveLength(1);
  expect(searchExpenses([several], 'bo dinner', names)).toHaveLength(1);
  expect(searchExpenses([several], 'cy', names)).toHaveLength(0);
});

test('paidPerMember adds up what each person paid out', () => {
  expect(paidPerMember([...data.expenses, expense({ id: 'm', payers: { a: 600, b: 400 } })])).toEqual({ a: 1333 + 600, b: 150400 });
});
