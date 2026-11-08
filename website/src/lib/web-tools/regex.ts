import { fail, limits, textFits, type Result } from "./contracts.ts";
export interface RegexInput {
  pattern: string;
  input: string;
  flags: string;
  replacement: string;
}
export interface RegexMatch {
  text: string;
  start: number;
  end: number;
  captures: (string | null)[];
  named: Record<string, string | null>;
}
export interface RegexValue {
  text: string;
  matches: RegexMatch[];
}
const encoder = new TextEncoder();

export function executeRegex(input: RegexInput): Result<RegexValue> {
  if (
    !textFits(input.input) ||
    !textFits(input.pattern, 8192) ||
    !textFits(input.replacement, 65536)
  )
    return fail("limit");
  if (
    !/^[gimsuy]*$/.test(input.flags) ||
    new Set(input.flags).size !== input.flags.length
  )
    return fail("regex", { detail: "flags" });
  try {
    const expression = new RegExp(input.pattern, input.flags);
    const matches: RegexMatch[] = [];
    let serializedBytes = 0;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(input.input)) !== null) {
      if (matches.length === 1000) return fail("limit", { detail: "matches" });
      const entry: RegexMatch = {
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        captures: match.slice(1).map((value) => value ?? null),
        named: Object.fromEntries(
          Object.entries(match.groups ?? {}).map(([key, value]) => [
            key,
            value ?? null,
          ]),
        ),
      };
      serializedBytes += encoder.encode(JSON.stringify(entry)).byteLength + 1;
      if (serializedBytes > limits.output) return fail("limit");
      matches.push(entry);
      if (!expression.global) break;
      if (match[0].length === 0) {
        const point = input.input.codePointAt(expression.lastIndex);
        expression.lastIndex +=
          expression.unicode && point !== undefined && point > 0xffff ? 2 : 1;
      }
    }
    // Native GetSubstitution semantics, constructed in bounded segments to prevent template expansion from allocating an unbounded string.
    const chunks: string[] = [];
    let bytes = 0,
      cursor = 0;
    const append = (text: string) => {
      bytes += encoder.encode(JSON.stringify(text)).byteLength - 2;
      if (bytes + serializedBytes > limits.output - 32) return false;
      chunks.push(text);
      return true;
    };
    for (const match of matches) {
      if (!append(input.input.slice(cursor, match.start))) return fail("limit");
      const template = input.replacement;
      for (let index = 0; index < template.length; ) {
        const dollar = template.indexOf("$", index);
        if (dollar === -1) {
          if (!append(template.slice(index))) return fail("limit");
          break;
        }
        if (!append(template.slice(index, dollar))) return fail("limit");
        const next = template[dollar + 1];
        let replacement: string | undefined,
          consumed = 2;
        if (next === "$") replacement = "$";
        else if (next === "&") replacement = match.text;
        else if (next === "`") replacement = input.input.slice(0, match.start);
        else if (next === "'") replacement = input.input.slice(match.end);
        else if (next === "<" && Object.keys(match.named).length) {
          const close = template.indexOf(">", dollar + 2);
          if (close !== -1) {
            const name = template.slice(dollar + 2, close);
            replacement = Object.hasOwn(match.named, name)
              ? (match.named[name] ?? "")
              : "";
            consumed = close - dollar + 1;
          }
        } else if (next && /\d/.test(next)) {
          let number = Number(template.slice(dollar + 1, dollar + 3));
          if (
            number > 0 &&
            number <= match.captures.length &&
            /^\d{2}$/.test(template.slice(dollar + 1, dollar + 3))
          )
            consumed = 3;
          else number = Number(next);
          if (number > 0 && number <= match.captures.length)
            replacement = match.captures[number - 1] ?? "";
        }
        if (replacement === undefined) {
          replacement = "$";
          consumed = 1;
        }
        if (!append(replacement)) return fail("limit");
        index = dollar + consumed;
      }
      cursor = match.end;
    }
    if (!append(input.input.slice(cursor))) return fail("limit");
    const value = { text: chunks.join(""), matches };
    return textFits(JSON.stringify(value), limits.output)
      ? { ok: true, value }
      : fail("limit");
  } catch {
    return fail("regex", { detail: "syntax" });
  }
}
