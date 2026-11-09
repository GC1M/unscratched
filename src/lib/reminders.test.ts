import { parseDate, reminderDates } from './reminders';

// jest.globalSetup.js pins TZ to America/New_York so the DST cases are deterministic.

const local = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime();
const parts = (t: number) => {
  const d = new Date(t);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};

test('tests run in America/New_York', () => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
});

test('reminders land at 9:00 local across a DST change', () => {
  // US DST ends 2026-11-01: the 7-days-before reminder is in EDT, the after ones in EST.
  const rs = reminderDates(local(2026, 11, 5), local(2026, 10, 1));
  expect(rs.map((r) => parts(r.at))).toEqual([
    [2026, 10, 29, 9, 0],
    [2026, 11, 19, 9, 0],
    [2026, 12, 5, 9, 0],
  ]);
  expect(new Date(rs[0].at).getTimezoneOffset()).toBe(240);
  expect(new Date(rs[1].at).getTimezoneOffset()).toBe(300);
});

test('reminders keep 9:00 local when DST starts', () => {
  // US DST starts 2026-03-08.
  const rs = reminderDates(local(2026, 3, 1), local(2026, 1, 1));
  expect(rs.map((r) => parts(r.at))).toEqual([
    [2026, 2, 22, 9, 0],
    [2026, 3, 15, 9, 0],
    [2026, 3, 31, 9, 0],
  ]);
});

test('messages match the plan', () => {
  const rs = reminderDates(local(2026, 11, 5), local(2026, 10, 1));
  expect(`${rs[0].title}`).toBe('Schedule your move-out walkthrough');
  expect(`${rs[1].title} ${rs[1].body}`).toBe("Has your deposit been returned? Check your state's deadline.");
  expect(rs[2].title).toBe(rs[1].title);
});

test('a move-out date in the past yields no reminders', () => {
  expect(reminderDates(local(2025, 1, 10), local(2026, 11, 9))).toEqual([]);
});

test('only reminders strictly after now are kept', () => {
  const moveOut = local(2026, 11, 8);
  expect(reminderDates(moveOut, local(2026, 11, 1, 9)).map((r) => parts(r.at))).toEqual([
    [2026, 11, 22, 9, 0],
    [2026, 12, 8, 9, 0],
  ]);
  expect(reminderDates(moveOut, local(2026, 11, 1, 8))).toHaveLength(3);
});

test('parseDate reads YYYY-MM-DD as local midnight', () => {
  expect(parseDate('2026-11-08')).toBe(local(2026, 11, 8));
  expect(parseDate(' 2024-02-29 ')).toBe(local(2024, 2, 29));
});

test.each(['', '2026-13-01', '2026-02-30', '2025-02-29', '2026-1-5', '11/08/2026', '2026-11-08x'])(
  'parseDate rejects %p',
  (s) => expect(parseDate(s)).toBeNull(),
);
