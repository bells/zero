import { fail, limits, textFits, type Result } from "./contracts.ts";

export interface CleanupOptions {
  trim: boolean;
  case: "keep" | "lower" | "upper";
  removeEmpty: boolean;
  deduplicate: boolean;
  sort: "none" | "ascending" | "descending";
}
export function cleanupText(
  input: string,
  options: CleanupOptions,
): Result<{ text: string }> {
  if (!textFits(input)) return fail("limit");
  const normalized = input.replace(/\r\n?/g, "\n");
  const terminal = normalized.endsWith("\n");
  let lines =
    normalized === ""
      ? []
      : (terminal ? normalized.slice(0, -1) : normalized).split("\n");
  if (lines.length > 20000) return fail("limit", { detail: "lines" });
  if (options.trim)
    lines = lines.map((line) => line.replace(/^[ \t]+|[ \t]+$/g, ""));
  if (options.case !== "keep")
    lines = lines.map((line) =>
      options.case === "lower" ? line.toLowerCase() : line.toUpperCase(),
    );
  if (options.removeEmpty)
    lines = lines.filter((line) => !/^[ \t]*$/.test(line));
  if (options.deduplicate) lines = [...new Set(lines)];
  if (options.sort !== "none") {
    const direction = options.sort === "ascending" ? 1 : -1;
    lines.sort((left, right) =>
      left === right ? 0 : (left < right ? -1 : 1) * direction,
    );
  }
  const text = lines.join("\n") + (terminal && lines.length ? "\n" : "");
  return textFits(text, limits.output)
    ? { ok: true, value: { text } }
    : fail("limit");
}
