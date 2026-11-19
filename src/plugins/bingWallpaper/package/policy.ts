const MARKET_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function checkedInstant(now: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now + MARKET_OFFSET_MS).getTime())) {
    throw new RangeError('Paper requires a valid timestamp.');
  }
  return now;
}

export function marketDay(now: number): string {
  return new Date(checkedInstant(now) + MARKET_OFFSET_MS).toISOString().slice(0, 10);
}

export function nextMidnight(now: number): number {
  return Math.floor((checkedInstant(now) + MARKET_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - MARKET_OFFSET_MS;
}

export function calendarDate(value: string): string | null {
  if (!/^\d{8}$/.test(value) || value.slice(0, 4) === '0000') return null;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === iso ? iso : null;
}

export function publicationDate(displayDate: string | undefined, startDate: string, now: number): string | null {
  const date = calendarDate(displayDate ?? startDate);
  return date !== null && date <= marketDay(now) ? date : null;
}

export function retrySeconds(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new RangeError('Paper requires a nonnegative retry attempt.');
  return [60, 300, 900, 1800][Math.min(attempt, 3)]!;
}

export function retryAt(now: number, attempt: number): number {
  return Math.min(checkedInstant(now) + retrySeconds(attempt) * 1000, nextMidnight(now));
}
