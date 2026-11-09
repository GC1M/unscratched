export interface Reminder {
  at: number;
  title: string;
  body: string;
}

const BEFORE = { title: 'Schedule your move-out walkthrough', body: 'Your move-out is in 7 days.' };
const DEPOSIT = { title: 'Has your deposit been returned?', body: "Check your state's deadline." };
const SCHEDULE = [
  { days: -7, ...BEFORE },
  { days: 14, ...DEPOSIT },
  { days: 30, ...DEPOSIT },
];

/** Reminders at 9:00 local, offset by calendar days (setDate) so DST shifts keep 9:00. Only those strictly after now. */
export function reminderDates(moveOutDate: number, now: number): Reminder[] {
  const d = new Date(moveOutDate);
  return SCHEDULE.map(({ days, title, body }) => ({
    at: new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 9).getTime(),
    title,
    body,
  })).filter((r) => r.at > now);
}

/** Parses YYYY-MM-DD as local midnight. Returns null when the text is not a real calendar date. */
export function parseDate(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const [y, mo, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const d = new Date(y, mo, day);
  return d.getFullYear() === y && d.getMonth() === mo && d.getDate() === day ? d.getTime() : null;
}
