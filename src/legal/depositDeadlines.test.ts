import { DEPOSIT_DEADLINES, DEPOSIT_TABLE_REVIEWED, depositDueDate, depositSummary, lookupDepositDeadline } from './depositDeadlines';

test('has 50 states plus DC with no duplicate codes', () => {
  expect(DEPOSIT_DEADLINES).toHaveLength(51);
  expect(new Set(DEPOSIT_DEADLINES.map((d) => d.code)).size).toBe(51);
  expect(DEPOSIT_DEADLINES.every((d) => /^[A-Z]{2}$/.test(d.code))).toBe(true);
});

test('every row cites an https source and has a note', () => {
  for (const d of DEPOSIT_DEADLINES) {
    expect(new URL(d.source).protocol).toBe('https:');
    expect(d.note.length).toBeGreaterThan(0);
    if (d.days != null) expect(d.days).toBeGreaterThan(0);
  }
  expect(DEPOSIT_TABLE_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('lookup is case-insensitive and trims; unknown codes return undefined', () => {
  expect(lookupDepositDeadline('ca')).toMatchObject({ code: 'CA', name: 'California', days: 21 });
  expect(lookupDepositDeadline(' Dc ')?.name).toBe('District of Columbia');
  expect(lookupDepositDeadline('ZZ')).toBeUndefined();
  expect(lookupDepositDeadline('')).toBeUndefined();
});

test('due date adds calendar days across a month end', () => {
  expect(depositDueDate(new Date(2027, 0, 20, 15).getTime(), 21)).toBe(new Date(2027, 1, 10).getTime());
});

test('summary mentions itemized days when they differ, and admits when there is no simple deadline', () => {
  expect(depositSummary(lookupDepositDeadline('FL')!)).toContain('15 days after move-out to return the deposit. They have 30 days');
  expect(depositSummary(lookupDepositDeadline('KY')!)).toMatch(/^In Kentucky, there is no simple deposit-return deadline\./);
});
