import { Cron } from "croner";
import { fail, textFits, type Result } from "./contracts.ts";
export interface CronInput {
  expression: string;
  mode: "unix" | "spring";
  baseline: string;
  timezone: string;
  locale: "zh" | "en";
}
export interface CronOccurrence {
  utc: string;
  local: string;
  offset: string;
}
export interface CronOutput {
  text: string;
  occurrences: CronOccurrence[];
  baseline: string;
  timezone: string;
  horizon: string;
  explanation: string;
  count: number;
}
const hour = 3_600_000;
function wallFormatter(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}
function wallTime(formatter: Intl.DateTimeFormat, instant: number): number {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const date = new Date(0);
  date.setUTCFullYear(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
  );
  date.setUTCHours(
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    0,
  );
  return date.getTime();
}
function instantsForWall(
  wall: number,
  formatter: Intl.DateTimeFormat,
  fixed: boolean,
): number[] {
  const offsets = new Set(
    [-36, -12, 0, 12, 36].map(
      (delta) =>
        wallTime(formatter, wall + delta * hour) - (wall + delta * hour),
    ),
  );
  const guesses = [...offsets].map((offset) => wall - offset);
  const exact = guesses
    .filter((instant) => wallTime(formatter, instant) === wall)
    .sort((a, b) => a - b);
  if (exact.length) return fixed ? exact.slice(0, 1) : exact;
  if (!fixed) return [];
  const lower = Math.min(...guesses),
    upper = Math.max(...guesses);
  for (let instant = lower; instant <= upper; instant += 60_000) {
    if (wallTime(formatter, instant) >= wall) return [instant];
  }
  return [];
}
function validateFields(fields: string[], mode: CronInput["mode"]): void {
  if (fields.length !== (mode === "unix" ? 5 : 6)) throw new Error("fields");
  const six = mode === "unix" ? ["0", ...fields] : fields;
  for (const [index, field] of six.entries()) {
    if (!/^[A-Z0-9*,/?#LWD-]+$/i.test(field)) throw new Error("syntax");
    if (
      index !== 3 &&
      index !== 5 &&
      /[?LW#]/i.test(
        field.replace(/JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC/gi, ""),
      )
    )
      throw new Error("syntax");
    if (mode === "unix" && /[?L#W]/i.test(field.replace(/WED|JUL/gi, "")))
      throw new Error("syntax");
    if (
      field.includes("?") &&
      (mode !== "spring" || ![3, 5].includes(index) || field !== "?")
    )
      throw new Error("syntax");
  }
}
function validBaseline(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hours, minutes, seconds = "0"] = match;
  const calendar = new Date(0);
  calendar.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  return (
    Number(year) >= 1 &&
    calendar.getUTCFullYear() === Number(year) &&
    calendar.getUTCMonth() === Number(month) - 1 &&
    calendar.getUTCDate() === Number(day) &&
    Number(hours) <= 23 &&
    Number(minutes) <= 59 &&
    Number(seconds) <= 59
  );
}
export function executeCron(input: CronInput): Result<CronOutput> {
  if (!textFits(input.expression, 1024)) return fail("limit");
  if (!input.expression.trim()) return fail("empty");
  if (!validBaseline(input.baseline))
    return fail("cron", { detail: "baseline" });
  let formatter: Intl.DateTimeFormat;
  try {
    if (/^[+-]/.test(input.timezone))
      return fail("cron", { detail: "timezone" });
    formatter = wallFormatter(input.timezone);
  } catch {
    return fail("cron", { detail: "timezone" });
  }
  try {
    const fields = input.expression.trim().toUpperCase().split(/\s+/);
    validateFields(fields, input.mode);
    const six = (input.mode === "unix" ? ["0", ...fields] : [...fields]) as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const fixed =
      input.mode === "unix" && /^\d+$/.test(six[1]) && /^\d+$/.test(six[2]);
    const dayOffsets: number[] = [];
    const nearestDays: number[] = [];
    let ordinaryDays: Cron | undefined;
    if (
      input.mode === "spring" &&
      six[3].split(",").some((part) => /^L-\d+$|^\d+W$/.test(part))
    ) {
      const ordinary: string[] = [];
      for (const part of six[3].split(",")) {
        if (/^L-\d+$/.test(part)) {
          const offset = Number(part.slice(2));
          if (offset < 1 || offset > 27)
            return fail("cron", { detail: "unsupported" });
          dayOffsets.push(offset);
        } else if (/^\d+W$/.test(part)) {
          const day = Number(part.slice(0, -1));
          if (day < 1 || day > 31) return fail("cron", { detail: "syntax" });
          nearestDays.push(day);
        } else {
          ordinary.push(part);
        }
      }
      if (ordinary.length)
        ordinaryDays = new Cron(`0 0 0 ${ordinary.join(",")} * *`, {
          timezone: "UTC",
          domAndDow: true,
          mode: "6-part",
        });
      six[3] = "*";
    }
    const normalized = six.map((field) => (field === "?" ? "*" : field));
    const andDays =
      input.mode === "spring" || /^\*/.test(six[3]) || /^\*/.test(six[5]);
    const cron = new Cron(normalized.join(" "), {
      timezone: "UTC",
      domAndDow: andDays,
      mode: "6-part",
    });
    const baseline = Date.parse(input.baseline);
    const horizonDate = new Date(baseline);
    horizonDate.setUTCFullYear(horizonDate.getUTCFullYear() + 50);
    const horizon = horizonDate.getTime();
    const baseWall = wallTime(formatter, baseline);
    const baseOffset = baseWall - baseline;
    const nearbyOffsets = [-48, 48].map(
      (delta) =>
        wallTime(formatter, baseline + delta * hour) -
        (baseline + delta * hour),
    );
    let cursor = new Date(
      baseWall -
        Math.max(0, ...nearbyOffsets.map((offset) => baseOffset - offset)) -
        1000,
    );
    const found = new Set<number>();
    const deadline = performance.now() + 4500;
    let stopWall = Infinity;
    while (true) {
      if (performance.now() > deadline) return fail("timeout");
      const next = cron.nextRun(cursor);
      if (
        !next ||
        next.getTime() > horizon + 48 * hour ||
        next.getTime() > stopWall
      )
        break;
      cursor = next;
      if (dayOffsets.length || nearestDays.length) {
        const last = new Date(next.getTime());
        last.setUTCMonth(last.getUTCMonth() + 1, 0);
        const day = new Date(next.getTime());
        day.setUTCHours(0, 0, 0, 0);
        if (
          !dayOffsets.some(
            (offset) => next.getUTCDate() === last.getUTCDate() - offset,
          ) &&
          !nearestDays.some((requested) => {
            if (requested > last.getUTCDate()) return false;
            const target = new Date(day);
            target.setUTCDate(requested);
            const weekday = target.getUTCDay();
            if (weekday === 0 && requested === last.getUTCDate()) return false;
            const expected =
              weekday === 0
                ? requested + 1
                : weekday === 6
                  ? requested === 1
                    ? 3
                    : requested - 1
                  : requested;
            return next.getUTCDate() === expected;
          }) &&
          !ordinaryDays?.match(day)
        ) {
          // The DOM predicate rejects this whole civil day, including every scheduled second.
          cursor = new Date(day);
          cursor.setUTCHours(23, 59, 59, 999);
          continue;
        }
      }
      for (const instant of instantsForWall(next.getTime(), formatter, fixed))
        if (instant > baseline && instant <= horizon) found.add(instant);
      if (found.size >= 10) {
        const tenth = [...found].sort((a, b) => a - b)[9]!;
        stopWall =
          wallTime(formatter, tenth) +
          Math.max(
            0,
            ...nearbyOffsets.map((offset) => Math.abs(baseOffset - offset)),
          ) +
          1000;
      }
    }
    const occurrences = [...found]
      .sort((a, b) => a - b)
      .slice(0, 10)
      .map((instant) => {
        const wall = wallTime(formatter, instant);
        const minutes = Math.round((wall - instant) / 60000);
        const offset = `${minutes >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
        return {
          utc: new Date(instant).toISOString(),
          local: new Date(wall).toISOString().slice(0, 19),
          offset,
        };
      });
    const rule = andDays
      ? input.locale === "zh"
        ? "月日与星期同时匹配"
        : "Day of month AND day of week"
      : input.locale === "zh"
        ? "月日或星期匹配"
        : "Day of month OR day of week";
    const labels =
      input.locale === "zh"
        ? ["秒", "分", "时", "月日", "月", "星期"]
        : ["second", "minute", "hour", "day", "month", "weekday"];
    const displayFields = input.mode === "unix" ? ["0", ...fields] : fields;
    const fieldExplanation = displayFields
      .map((field, index) => `${labels[index]} ${field}`)
      .join(" · ");
    const explanation = `${input.mode} · ${fields.join(" ")} · ${fieldExplanation} · ${rule}`;
    const result = {
      occurrences,
      baseline: new Date(baseline).toISOString(),
      timezone: input.timezone,
      horizon: new Date(horizon).toISOString(),
      explanation,
      count: occurrences.length,
    };
    const text = [
      explanation,
      `${input.locale === "zh" ? "时区" : "Timezone"} ${result.timezone}`,
      `${input.locale === "zh" ? "基准" : "Baseline"} ${result.baseline}`,
      `${input.locale === "zh" ? "搜索上限" : "Horizon"} ${result.horizon}`,
      `${input.locale === "zh" ? "次数" : "Count"} ${result.count}`,
      ...occurrences.map(
        (item) => `${item.utc} | ${item.local} ${item.offset}`,
      ),
    ].join("\n");
    return { ok: true, value: { ...result, text } };
  } catch {
    return fail("cron", { detail: "syntax" });
  }
}
