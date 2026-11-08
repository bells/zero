import { fail, type Result } from "./contracts.ts";

export interface DateInput {
  action: "difference" | "shift";
  start: string;
  end: string;
  amount: number;
  weekends: boolean;
}
export interface DateValue {
  text: string;
  days?: number;
  date?: string;
}
const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const leap = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const yearStart = (year: number) =>
  365 * (year - 1) +
  Math.floor((year - 1) / 4) -
  Math.floor((year - 1) / 100) +
  Math.floor((year - 1) / 400);

export function civilDay(input: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return;
  const [year = 0, month = 0, day = 0] = input.split("-").map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12) return;
  const length = monthLengths[month - 1]! + (month === 2 && leap(year) ? 1 : 0);
  if (day < 1 || day > length) return;
  let ordinal = yearStart(year) + day - 1;
  for (let m = 1; m < month; m++)
    ordinal += monthLengths[m - 1]! + (m === 2 && leap(year) ? 1 : 0);
  return ordinal;
}
function formatDay(ordinal: number): string {
  let low = 1,
    high = 10000;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (yearStart(middle) <= ordinal) low = middle;
    else high = middle;
  }
  let remaining = ordinal - yearStart(low),
    month = 1;
  for (; month < 12; month++) {
    const length =
      monthLengths[month - 1]! + (month === 2 && leap(low) ? 1 : 0);
    if (remaining < length) break;
    remaining -= length;
  }
  return `${String(low).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(remaining + 1).padStart(2, "0")}`;
}
export function calculateDate(input: DateInput): Result<DateValue> {
  const start = civilDay(input.start);
  if (start === undefined) return fail("calendar");
  if (input.action === "difference") {
    const end = civilDay(input.end);
    if (end === undefined) return fail("calendar");
    let days = end - start;
    if (input.weekends) {
      const first = Math.min(start, end),
        last = Math.max(start, end);
      const weeks = Math.floor((last - first) / 7);
      let count = weeks * 5;
      for (let day = first + weeks * 7 + 1; day <= last; day++)
        if (day % 7 < 5) count++;
      days = Math.sign(days) * count;
    }
    return { ok: true, value: { days, text: String(days) } };
  }
  if (!Number.isSafeInteger(input.amount) || Math.abs(input.amount) > 3652058)
    return fail("calendar", { detail: "range" });
  let ordinal = start;
  if (input.weekends) {
    let remaining = Math.abs(input.amount);
    const direction = Math.sign(input.amount);
    while (remaining > 0) {
      ordinal += direction;
      if (ordinal < 0 || ordinal > 3652058)
        return fail("calendar", { detail: "range" });
      if (ordinal % 7 < 5) remaining--;
    }
  } else ordinal += input.amount;
  if (ordinal < 0 || ordinal > 3652058)
    return fail("calendar", { detail: "range" });
  const date = formatDay(ordinal);
  return { ok: true, value: { date, text: date } };
}
