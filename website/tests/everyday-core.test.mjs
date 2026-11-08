import test from "node:test";
import assert from "node:assert/strict";
import { cleanupText } from "../src/lib/web-tools/text-cleanup.ts";
import { calculateDate } from "../src/lib/web-tools/date-calculator.ts";
import { generatePasswords } from "../src/lib/web-tools/password.ts";
import { executeRegex } from "../src/lib/web-tools/regex.ts";
const value = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
const options = {
  trim: false,
  case: "keep",
  removeEmpty: false,
  deduplicate: true,
  sort: "none",
};
test("cleanup order, terminal separators, lexical sorting and successful empty text", () => {
  assert.equal(
    value(
      cleanupText(" A\r\na\ra\r\n", { ...options, trim: true, case: "lower" }),
    ).text,
    "a\n",
  );
  assert.equal(
    value(cleanupText("2\n10\n1", { ...options, sort: "ascending" })).text,
    "1\n10\n2",
  );
  assert.equal(
    value(cleanupText(" \t\r\n", { ...options, removeEmpty: true })).text,
    "",
  );
  assert.equal(
    value(cleanupText("\u00a0A\u00a0", { ...options, trim: true })).text,
    "\u00a0A\u00a0",
  );
  assert.equal(value(cleanupText("", options)).text, "");
  assert.equal(cleanupText("a\n".repeat(20001), options).ok, false);
  assert.equal(cleanupText("中".repeat(350000), options).ok, false);
});
test("civil dates preserve Gregorian bounds and weekday endpoint rules", () => {
  const run = (start, end, weekends = false) =>
    calculateDate({ start, end, weekends, action: "difference", amount: 0 });
  assert.equal(value(run("0001-01-01", "9999-12-31")).days, 3652058);
  assert.equal(value(run("2026-11-06", "2026-11-09", true)).days, 1);
  assert.equal(value(run("2026-11-09", "2026-11-06", true)).days, -1);
  assert.equal(run("2023-02-29", "2024-01-01").ok, false);
  assert.equal(run("2024-2-29", "2024-01-01").ok, false);
  for (const [start, amount, expected] of [
    ["2026-11-06", 1, "2026-11-09"],
    ["2026-11-09", -1, "2026-11-06"],
    ["2026-11-07", 0, "2026-11-07"],
  ])
    assert.equal(
      value(
        calculateDate({
          start,
          amount,
          weekends: true,
          action: "shift",
          end: "",
        }),
      ).date,
      expected,
    );
  assert.equal(
    calculateDate({
      start: "9999-12-31",
      amount: 1,
      weekends: false,
      action: "shift",
      end: "",
    }).ok,
    false,
  );
});
test("passwords use only selected groups and bounded unbiased secure sampling", () => {
  const settings = {
    length: 20,
    count: 5,
    uppercase: true,
    lowercase: true,
    digits: true,
    symbols: false,
  };
  const result = value(generatePasswords(settings));
  assert.equal(result.passwords.length, 5);
  for (const password of result.passwords) {
    assert.equal(password.length, 20);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /[0-9]/);
    assert.match(password, /^[A-Za-z0-9]+$/);
  }
  assert.equal(generatePasswords({ ...settings, length: 7 }).ok, false);
  assert.equal(
    generatePasswords({
      ...settings,
      uppercase: false,
      lowercase: false,
      digits: false,
    }).ok,
    false,
  );
  assert.equal(
    generatePasswords(settings, () => {
      throw Error("synthetic");
    }).ok,
    false,
  );
  assert.equal(
    generatePasswords(settings, (buffer) => buffer.fill(255)).ok,
    false,
  );
  assert.equal(
    generatePasswords(settings, (buffer) => buffer.fill(0)).ok,
    false,
  );
});
test("regex preserves native UTF-16, capture and replacement semantics", () => {
  const run = (pattern, input, flags = "g", replacement = "$&") =>
    executeRegex({ pattern, input, flags, replacement });
  assert.deepEqual(
    value(run("(?:)", "😀", "gu")).matches.map((m) => m.start),
    [0, 2],
  );
  assert.deepEqual(value(run("(?<a>a)(b)?", "a")).matches[0].captures, [
    "a",
    null,
  ]);
  assert.equal(value(run("(?<a>a)(b)?", "a", "g", "$<a>-$2")).text, "a-");
  assert.equal(value(run("(a)(b)", "ab ab", "g", "$2-$1")).text, "b-a b-a");
  assert.deepEqual(value(run("a", "ba", "y")).matches, []);
  assert.equal(run("[", "sample").ok, false);
  assert.equal(run("a", "a", "gg").ok, false);
  assert.equal(run("a", "a", "d").ok, false);
  assert.equal(run("a", "a".repeat(1001)).ok, false);
  assert.equal(value(run("x", "<script>", "g", "")).text, "<script>");
});
test("regex unknown named captures cannot resolve prototype properties", () => {
  for (const replacement of [
    "$<toString>",
    "$<constructor>",
    "$<__proto__>",
    "$<hasOwnProperty>",
  ]) {
    const input = { pattern: "(?<a>a)", input: "a", flags: "g", replacement };
    assert.equal(
      value(executeRegex(input)).text,
      "a".replace(/(?<a>a)/g, replacement),
    );
  }
});
test("preflight rejects excessive inputs before a Worker clone", async () => {
  const { validateEverydayJob } = await import(
    "../src/lib/web-tools/everyday-contracts.ts"
  );
  assert.equal(
    validateEverydayJob({
      tool: "text-cleanup",
      input: "x".repeat(1048577),
      options,
    }).ok,
    false,
  );
  assert.equal(
    validateEverydayJob({
      tool: "qrcode",
      options: { mode: "generate", input: "中".repeat(667) },
    }).ok,
    false,
  );
  assert.equal(
    validateEverydayJob({
      tool: "regex",
      options: {
        pattern: "x".repeat(8193),
        input: "",
        flags: "g",
        replacement: "",
      },
    }).ok,
    false,
  );
});
test('directory descriptions reflect seventeen tools and password example is bilingual',async()=>{
  const {guideCopy}=await import('../src/content/web-tool-guides.ts');
  const {everydayGuides}=await import('../src/content/everyday-content.ts');
  assert.match(guideCopy.zh.description,/十七/);assert.match(guideCopy.en.description,/Seventeen/);
  assert.match(everydayGuides('zh').password.examples[0].output,/字符/);
});
