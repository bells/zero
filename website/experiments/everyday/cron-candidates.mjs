import { Cron } from "croner";
import { CronExpressionParser } from "cron-parser";
import { executeCron } from "../../src/lib/web-tools/cron.ts";
const cases = [
  ["0 30 1 * * *", "2026-11-01T04:00:00Z"],
  ["0 30 2 * * *", "2026-03-08T06:00:00Z"],
  ["0 */30 * * * *", "2026-11-01T04:45:00Z"],
  ["0 0 9 L-2 * *", "2026-01-01T00:00:00Z"],
  ["0 0 9 LW * *", "2026-01-01T00:00:00Z"],
];
for (const [expression, baseline] of cases) {
  console.log(expression, baseline);
  for (const candidate of ["croner11.0.0", "cron-parser5.10.4", "adapter"])
    try {
      let times;
      if (candidate === "croner11.0.0")
        times = new Cron(expression, {
          timezone: "America/New_York",
          domAndDow: true,
        })
          .nextRuns(3, new Date(baseline))
          .map((time) => time.toISOString());
      else if (candidate === "cron-parser5.10.4") {
        const cron = CronExpressionParser.parse(expression, {
          tz: "America/New_York",
          currentDate: baseline,
        });
        times = Array.from({ length: 3 }, () => cron.next().toISOString());
      } else {
        const result = executeCron({
          expression,
          baseline,
          mode: "spring",
          timezone: "America/New_York",
          locale: "en",
        });
        times = result.ok
          ? result.value.occurrences.slice(0, 3).map((item) => item.utc)
          : result.error;
      }
      console.log(candidate, JSON.stringify(times));
    } catch {
      console.log(candidate, "unsupported");
    }
}
