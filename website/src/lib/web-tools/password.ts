import { fail, type Result } from "./contracts.ts";
export const passwordGroups = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{}?",
} as const;
export interface PasswordOptions {
  length: number;
  count: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
}
export interface PasswordValue {
  text: string;
  passwords: string[];
}
export function generatePasswords(
  options: PasswordOptions,
  random: (buffer: Uint8Array) => Uint8Array = (buffer) =>
    crypto.getRandomValues(buffer),
): Result<PasswordValue> {
  const groups = (
    Object.keys(passwordGroups) as (keyof typeof passwordGroups)[]
  )
    .filter((key) => options[key])
    .map((key) => passwordGroups[key]);
  if (
    !Number.isInteger(options.length) ||
    options.length < 8 ||
    options.length > 128 ||
    !Number.isInteger(options.count) ||
    options.count < 1 ||
    options.count > 100 ||
    !groups.length
  )
    return fail("password", { detail: "settings" });
  const alphabet = groups.join("");
  const ceiling = 256 - (256 % alphabet.length);
  const passwords: string[] = [];
  const bytes = new Uint8Array(256);
  let offset = bytes.length,
    draws = 0;
  const started = performance.now();
  try {
    for (
      let attempts = 0;
      attempts < 10000 && passwords.length < options.count;
      attempts++
    ) {
      let candidate = "";
      while (candidate.length < options.length) {
        // Bound rejected byte draws as well as whole password candidates.
        if (++draws > 10000 * 128 * 4)
          return fail("password", { detail: "attempts" });
        if (offset === bytes.length) {
          if (performance.now() - started > 5000) return fail("timeout");
          random(bytes);
          offset = 0;
        }
        const byte = bytes[offset++]!;
        if (byte < ceiling) candidate += alphabet[byte % alphabet.length];
      }
      if (
        groups.every((group) =>
          [...candidate].some((character) => group.includes(character)),
        )
      )
        passwords.push(candidate);
    }
  } catch {
    return fail("password", { detail: "random" });
  } finally {
    bytes.fill(0);
  }
  if (passwords.length !== options.count)
    return fail("password", { detail: "attempts" });
  return { ok: true, value: { passwords, text: passwords.join("\n") } };
}
