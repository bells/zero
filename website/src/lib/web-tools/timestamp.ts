import { fail, type Result } from './contracts.ts';
export type Unit = 'auto' | 'seconds' | 'milliseconds';
export interface TimestampValue { milliseconds: number; interpretation: 'seconds' | 'milliseconds' | 'offset' | 'UTC' | 'UTC+08:00' }
export function parseTimestamp(input: string, unit: Unit = 'auto', timezone: 'UTC' | 'UTC+08:00' = 'UTC+08:00'): Result<TimestampValue> {
  const text = input.trim();
  if (input.length > 256) return fail('limit');
  if (/^[+-]?\d+$/.test(text)) {
    const digits = text.replace(/^[+-]/, '').length;
    const adopted = unit === 'auto' ? digits === 10 ? 'seconds' : digits === 13 ? 'milliseconds' : null : unit;
    if (!adopted) return fail('unit');
    const number = Number(text);
    const milliseconds = number * (adopted === 'seconds' ? 1000 : 1);
    if (!Number.isSafeInteger(number) || !Number.isSafeInteger(milliseconds) || Math.abs(milliseconds) > 8.64e15) return fail('number');
    return { ok: true, value: { milliseconds, interpretation: adopted } };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})([ T])(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/.exec(text);
  if (!match) return fail('date');
  const [, yearText, monthText, dayText, separator, hourText, minuteText, secondText, fraction, offset] = match;
  if (separator === 'T' && !offset) return fail('date');
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return fail('date');
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, Number((fraction || '').padEnd(3, '0')));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return fail('date');
  let offsetMinutes = timezone === 'UTC' ? 0 : 480;
  if (offset) {
    if (offset === 'Z') offsetMinutes = 0;
    else {
      const hours = Number(offset.slice(1, 3)), minutes = Number(offset.slice(4));
      if (hours > 23 || minutes > 59) return fail('date');
      offsetMinutes = (hours * 60 + minutes) * (offset[0] === '-' ? -1 : 1);
    }
  }
  const milliseconds = date.getTime() - offsetMinutes * 60_000;
  return { ok: true, value: { milliseconds, interpretation: offset ? 'offset' : timezone } };
}
export function timestampRows(milliseconds: number, now: number, locale: 'zh' | 'en'): [string, string, string, string, string, string] {
  const iso = new Date(milliseconds).toISOString();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US-u-ca-gregory', { timeZone: 'Etc/GMT-8', era: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' }).formatToParts(new Date(milliseconds)).map((part) => [part.type, part.value]));
  const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year);
  const yearText = year < 0 ? `-${String(-year).padStart(6, '0')}` : String(year).padStart(4, '0');
  const shifted = `${yearText}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}`;
  const delta = (milliseconds - now) / 1000;
  const [divisor, unit] = Math.abs(delta) < 60 ? [1, 'second'] as const : Math.abs(delta) < 3600 ? [60, 'minute'] as const : Math.abs(delta) < 86400 ? [3600, 'hour'] as const : [86400, 'day'] as const;
  return [String(Math.floor(milliseconds / 1000)), String(milliseconds), `${shifted} UTC+08:00`, iso.replace('T', ' ').replace('Z', ' UTC'), iso, new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(delta / divisor), unit)];
}
