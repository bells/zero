import test from "node:test";
import assert from "node:assert/strict";
import { executeCron } from "../src/lib/web-tools/cron.ts";
const run = (
  expression,
  baseline,
  mode = "unix",
  timezone = "America/New_York",
) => executeCron({ expression, baseline, mode, timezone, locale: "en" });
test("Unix DST reference sequences", () => {
  for (const [expression, baseline, expected] of [
    [
      "30 2 * * *",
      "2026-03-08T06:00:00Z",
      [
        "2026-03-08T07:00:00.000Z",
        "2026-03-09T06:30:00.000Z",
        "2026-03-10T06:30:00.000Z",
      ],
    ],
    [
      "30 1 * * *",
      "2026-11-01T04:00:00Z",
      [
        "2026-11-01T05:30:00.000Z",
        "2026-11-02T06:30:00.000Z",
        "2026-11-03T06:30:00.000Z",
      ],
    ],
    [
      "*/30 * * * *",
      "2026-11-01T04:45:00Z",
      [
        "2026-11-01T05:00:00.000Z",
        "2026-11-01T05:30:00.000Z",
        "2026-11-01T06:00:00.000Z",
      ],
    ],
  ]) {
    const result = run(expression, baseline);
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.value.occurrences.slice(0, 3).map((item) => item.utc),
      expected,
    );
  }
});
test("Cron modes enforce fields and different day combination", () => {
  assert.equal(run("@daily", "2026-01-01T00:00:00Z").ok, false);
  assert.equal(run("0 0 9 * * *", "2026-01-01T00:00:00Z").ok, false);
  const unix = run("0 9 1 * MON", "2026-01-01T00:00:00Z");
  const spring = run("0 0 9 1 * MON", "2026-01-01T00:00:00Z", "spring");
  assert.equal(unix.ok, true);
  assert.equal(spring.ok, true);
  assert.notEqual(
    unix.value.occurrences[0].utc,
    spring.value.occurrences[0].utc,
  );
});
import { readFileSync } from "node:fs";
test("Spring 7.0.10 official calendar and DST fixtures match all ten instants", () => {
  const rows = readFileSync(
    new URL(
      "../experiments/everyday/spring-7.0.10-reference.txt",
      import.meta.url,
    ),
    "utf8",
  )
    .trim()
    .split("\n")
    .slice(2);
  for (const row of rows) {
    const [expression, baseline, ...expected] = row.split("|");
    const result = run(expression, baseline, "spring");
    assert.equal(result.ok, true, expression);
    assert.deepEqual(
      result.value.occurrences.map((item) => item.utc.replace(".000Z", "Z")),
      expected,
      expression,
    );
  }
});
test("Cron validates timezone and explicit baseline, and reports horizon exhaustion", () => {
  assert.equal(run("* * * * *", "2026-01-01T00:00:00").ok, false);
  assert.equal(
    run("* * * * *", "2026-01-01T00:00:00Z", "unix", "Invalid/Zone").ok,
    false,
  );
  const result = run("0 0 31 2 *", "2026-01-01T00:00:00Z");
  assert.equal(result.ok, true);
  assert.equal(result.value.count, 0);
  assert.equal(result.value.horizon, "2076-01-01T00:00:00.000Z");
});
test("Cron rejects normalized impossible baseline dates", () => {
  assert.equal(run("* * * * *", "2026-02-30T00:00:00Z").ok, false);
  assert.equal(run("* * * * *", "2026-01-01T24:00:00Z").ok, false);
});
test("Unix wildcard-origin day fields intersect, explicit ranges use OR", () => {
  const a = run("0 9 */2 * MON", "2026-01-01T00:00:00Z", "unix", "UTC");
  const b = run("0 9 1-31/2 * MON", "2026-01-01T00:00:00Z", "unix", "UTC");
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.value.occurrences[0].utc, "2026-01-05T09:00:00.000Z");
  assert.equal(b.value.occurrences[0].utc, "2026-01-01T09:00:00.000Z");
  assert.equal(run("0 9 * JUL WED", "2026-01-01T00:00:00Z").ok, true);
});
test("Spring lists permit last-day offsets and ordinary days together", () => {
  const result = run(
    "0 0 9 L-2,15 * *",
    "2026-01-01T00:00:00Z",
    "spring",
    "UTC",
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.occurrences.slice(0, 3).map((item) => item.utc),
    [
      "2026-01-15T09:00:00.000Z",
      "2026-01-29T09:00:00.000Z",
      "2026-02-15T09:00:00.000Z",
    ],
  );
});
test("Unix interval spring gap skips missing times", () => {
  const result = run("*/30 * * * *", "2026-03-08T06:45:00Z");
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.occurrences.slice(0, 3).map((item) => item.utc),
    [
      "2026-03-08T07:00:00.000Z",
      "2026-03-08T07:30:00.000Z",
      "2026-03-08T08:00:00.000Z",
    ],
  );
});
test("Sparse Spring schedules return fewer than ten, preserving exact horizon", () => {
  const result = run(
    "0 0 0 29 FEB MON",
    "2026-01-01T00:00:00Z",
    "spring",
    "UTC",
  );
  assert.equal(result.ok, true);
  assert.ok(result.value.count > 0 && result.value.count < 10);
  assert.equal(result.value.horizon, "2076-01-01T00:00:00.000Z");
});
test("Explicit offsets reproduce the same UTC baseline and target-zone results", () => {
  const a = run("0 9 * * *", "2026-01-01T00:00:00Z", "unix", "Asia/Shanghai");
  const b = run(
    "0 9 * * *",
    "2026-01-01T08:00:00+08:00",
    "unix",
    "Asia/Shanghai",
  );
  assert.deepEqual(a, b);
  assert.equal(a.value.occurrences[0].offset, "+08:00");
  const zh = executeCron({
    expression: "0 0 9 L-2 * *",
    baseline: "2026-01-01T00:00:00Z",
    mode: "spring",
    timezone: "UTC",
    locale: "zh",
  });
  assert.match(zh.value.explanation, /月日 L-2/);
  assert.match(zh.value.explanation, /同时匹配/);
});
test("A computation deadline is a timeout error distinct from no occurrences", (context) => {
  let ticks = 0;
  context.mock.method(performance, "now", () => ticks++ * 5000);
  const result = run("* * * * *", "2026-01-01T00:00:00Z");
  assert.deepEqual(result, { ok: false, error: { code: "timeout" } });
});
test("Spring invalid and nonmonotonic reference edge syntax fails explicitly", () => {
  for (const field of ["L-0", "L-28", "L-100"])
    assert.equal(
      run(`0 0 9 ${field} * *`, "2026-01-01T00:00:00Z", "spring").ok,
      false,
    );
});
test("Dense Spring special-day schedules skip rejected dates without losing ordinary list dates", () => {
  const cases = [
    ["* * * L-1 * *", "2026-11-29T00:00:00.000Z"],
    ["* * * 15W * *", "2026-11-16T00:00:00.000Z"],
    ["* * * L-1,10 * *", "2026-11-10T00:00:00.000Z"],
    ["* * * 15W,10 * *", "2026-11-10T00:00:00.000Z"],
    ["* * * L-1 NOV SUN", "2026-11-29T00:00:00.000Z"],
    ["* * * L-1,30 NOV MON", "2026-11-30T05:00:00.000Z", "America/New_York"],
  ];
  for (const [expression, first, timezone = "UTC"] of cases) {
    const started = performance.now();
    const result = run(expression, "2026-11-08T00:00:00Z", "spring", timezone);
    const elapsed = performance.now() - started;
    assert.equal(result.ok, true, expression);
    assert.deepEqual(
      result.value.occurrences.map((item) => item.utc),
      Array.from({ length: 10 }, (_, index) =>
        new Date(Date.parse(first) + index * 1000).toISOString(),
      ),
      expression,
    );
    assert.ok(elapsed < 1000, `${expression} took ${elapsed} ms`);
  }
});
