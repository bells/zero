import { formatDialect, mysql, postgresql, sqlite } from "sql-formatter";
import Tokenizer from "./sql-vendor-Tokenizer.ts";
import type { TokenizerOptions } from "./sql-vendor-TokenizerOptions.ts";
import { fail, textFits, limits, type Result } from "./contracts.ts";
export interface SqlInput {
  input: string;
  dialect: "mysql" | "postgresql" | "sqlite";
  action: "format" | "compact";
}
const dialects = { mysql, postgresql, sqlite };
export function executeSql(job: SqlInput): Result<{ text: string }> {
  if (!textFits(job.input)) return fail("limit");
  if (!job.input.trim()) return fail("empty");
  if (!(job.dialect in dialects) || !["format", "compact"].includes(job.action))
    return fail("sql", { detail: "syntax" });
  try {
    const dialect = dialects[job.dialect];
    const tokenizer = new Tokenizer(
      dialect.tokenizerOptions as unknown as TokenizerOptions,
      dialect.name,
    );
    const tokens = tokenizer.tokenize(job.input, {});
    if (
      job.dialect === "mysql" &&
      tokens.some(
        (token) => token.type === "LINE_COMMENT" && /^--[^\s]/.test(token.raw),
      )
    )
      return fail("sql", { detail: "unsupported" });
    let text: string;
    if (job.action === "format") {
      text = formatDialect(job.input, {
        dialect,
        tabWidth: 2,
        keywordCase: "preserve",
        identifierCase: "preserve",
        dataTypeCase: "preserve",
        functionCase: "preserve",
      });
      // Formatter handling of comments or adjacent literals may change semantics. Reject such output.
      const outputTokens = tokenizer.tokenize(text, {});
      if (
        tokens.length !== outputTokens.length ||
        tokens.some((token, index) => token.raw !== outputTokens[index]?.raw)
      )
        return fail("sql", { detail: "unsupported" });
      for (let index = tokens.length - 1; index > 0; index--) {
        if (
          job.dialect === "postgresql" &&
          tokens[index]!.type === "STRING" &&
          /[\r\n]/.test(tokens[index]!.precedingWhitespace ?? "") &&
          !/[\r\n]/.test(outputTokens[index]!.precedingWhitespace ?? "")
        ) {
          const position = outputTokens[index]!.start;
          text = text.slice(0, position) + "\n" + text.slice(position);
        }
      }
    } else {
      text = tokens
        .map((token, index) => {
          if (index === 0) return token.raw;
          const previous = tokens[index - 1];
          const whitespace = token.precedingWhitespace;
          if (previous?.type === "LINE_COMMENT") return `\n${token.raw}`;
          // Retain every existing newline, covering PostgreSQL adjacent-string concatenation.
          const separator = whitespace
            ? /[\r\n]/.test(whitespace)
              ? "\n"
              : " "
            : "";
          return separator + token.raw;
        })
        .join("");
      const check = tokenizer.tokenize(text, {});
      if (
        check.length !== tokens.length ||
        tokens.some((token, index) => token.raw !== check[index]?.raw)
      )
        return fail("sql", { detail: "unsupported" });
    }
    if (!textFits(text, limits.output)) return fail("limit");
    return { ok: true, value: { text } };
  } catch (error) {
    const position =
      error instanceof Error
        ? /line (\d+) column (\d+)/.exec(error.message)
        : null;
    return fail("sql", {
      detail: "syntax",
      ...(position
        ? { line: Number(position[1]), column: Number(position[2]) }
        : {}),
    });
  }
}
