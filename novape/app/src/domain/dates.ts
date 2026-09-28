import type { ISODate, Timestamp } from '../models';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** Local calendar date of a timestamp. */
export function toISODate(t: Timestamp | Date): ISODate {
  const d = typeof t === 'number' ? new Date(t) : t;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of an ISO date. */
export function startOfDay(date: ISODate): Timestamp {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

/** Whole days from `a` to `b` (b − a), DST-safe. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Sep 8" */
export function formatShortDate(date: ISODate): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Sep 8 – 14" or "Sep 29 – Oct 5" */
export function formatDateRange(from: ISODate, to: ISODate): string {
  const [, m1] = from.split('-').map(Number);
  const [, m2, d2] = to.split('-').map(Number);
  return m1 === m2 ? `${formatShortDate(from)} – ${d2}` : `${formatShortDate(from)} – ${formatShortDate(to)}`;
}

/** "September 2026" */
export function formatMonthYear(date: ISODate): string {
  const [y, m] = date.split('-').map(Number);
  const long = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' });
  return `${long} ${y}`;
}

/** Monday = 0 … Sunday = 6 */
export function weekdayIndex(date: ISODate): number {
  return (new Date(startOfDay(date)).getDay() + 6) % 7;
}

export function weekdayName(index: number): string {
  return WEEKDAYS[index];
}

export function formatTime(t: Timestamp): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatHour(h: number): string {
  return `${pad(h % 24)}:00`;
}

export function greetingFor(t: Timestamp): string {
  const h = new Date(t).getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Relative label for notification lists. */
export function formatRelative(t: Timestamp, now: Timestamp): string {
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins} min ago`;
  const today = toISODate(now);
  const day = toISODate(t);
  if (day === today) return formatTime(t);
  if (diffDays(day, today) === 1) return 'Yesterday';
  return formatShortDate(day);
}
