import { fail, textFits, type Result } from "./contracts.ts";
import type { CleanupOptions } from "./text-cleanup.ts";
import type { DateInput } from "./date-calculator.ts";
import type { PasswordOptions } from "./password.ts";
import type { RegexInput, RegexMatch } from "./regex.ts";
import type { HashInput } from "./hash.ts";
export const everydayTools = [
  "qrcode",
  "text-cleanup",
  "hash",
  "regex",
  "sql",
  "date-calculator",
  "password",
  "cron",
] as const;
export type EverydayTool = (typeof everydayTools)[number];
export type EverydayJob =
  | { tool: "text-cleanup"; input: string; options: CleanupOptions }
  | { tool: "date-calculator"; options: DateInput }
  | { tool: "password"; options: PasswordOptions }
  | { tool: "regex"; options: RegexInput }
  | { tool: "hash"; options: HashInput }
  | {
      tool: "sql";
      options: {
        input: string;
        dialect: "mysql" | "postgresql" | "sqlite";
        action: "format" | "compact";
      };
    }
  | {
      tool: "cron";
      options: {
        expression: string;
        mode: "unix" | "spring";
        baseline: string;
        timezone: string;
        locale: "zh" | "en";
      };
    }
  | {
      tool: "qrcode";
      options:
        | { mode: "generate"; input: string }
        | { mode: "decode"; file: Blob };
    };
export interface EverydayValue {
  text: string;
  matches?: RegexMatch[];
  passwords?: string[];
  comparison?: "match" | "mismatch" | "none";
  png?: Blob;
  svg?: string;
}
export function isEverydayTool(
  value: string | undefined,
): value is EverydayTool {
  return everydayTools.some((tool) => tool === value);
}

export function validateEverydayJob(job: EverydayJob): Result<EverydayJob> {
  let fields: [string, number][] = [];
  switch (job.tool) {
    case "text-cleanup":
      fields = [[job.input, 1048576]];
      break;
    case "regex":
      fields = [
        [job.options.input, 1048576],
        [job.options.pattern, 8192],
        [job.options.replacement, 65536],
        [job.options.flags, 6],
      ];
      break;
    case "sql":
      fields = [[job.options.input, 1048576]];
      break;
    case "cron":
      fields = [
        [job.options.expression, 1024],
        [job.options.baseline, 64],
        [job.options.timezone, 256],
      ];
      break;
    case "date-calculator":
      fields = [
        [job.options.start, 10],
        [job.options.end, 10],
      ];
      break;
    case "hash":
      fields = [[job.options.expected, 1048576]];
      if (job.options.mode === "text")
        fields.push([job.options.input, 1048576]);
      else if (job.options.file.size > 268435456) return fail("limit");
      break;
    case "qrcode":
      if (job.options.mode === "generate") fields = [[job.options.input, 2000]];
      else if (job.options.file.size > 16777216) return fail("limit");
      break;
    case "password":
      break;
  }
  return fields.every(([text, max]) => textFits(text, max))
    ? { ok: true, value: job }
    : fail("limit");
}
