import satisfies from "semver/functions/satisfies.js";
import valid from "semver/functions/valid.js";

// Range syntax is deliberately narrower than npm's; comparisons remain library-owned.
export function isProtocolVersion(value: string): boolean {
  return /^[0-9]/.test(value) && value.trim() === value && valid(value) !== null;
}

export function isProtocolRange(range: string): boolean {
  const tokens = range.split(" ");
  if (tokens.length === 0 || tokens.some((token) => token.length === 0)) return false;
  let bounded = false;
  for (const token of tokens) {
    const match = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(token);
    if (!match || !isProtocolVersion(match[2])) return false;
    const operator = match[1] ?? "=";
    if (tokens.length > 1 && (operator === "^" || operator === "~")) return false;
    bounded ||= ["=", "^", "~", "<", "<="].includes(operator);
  }
  return bounded;
}

export function protocolVersionMatches(version: string, range: string): boolean {
  return isProtocolVersion(version) && isProtocolRange(range) && satisfies(version, range);
}
