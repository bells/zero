import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { valid, satisfies } from "semver";

const schema = JSON.parse(fs.readFileSync(new URL("../../schemas/plugin-manifest-v2.schema.json", import.meta.url), "utf8"));
const validateShape = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
export function validVersion(value) {
  return typeof value === "string" && /^[0-9]/.test(value) && value.trim() === value && valid(value) !== null;
}
export function validRange(range) {
  if (typeof range !== "string") return false;
  const tokens = range.split(" ");
  let bounded = false;
  for (const token of tokens) {
    const match = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(token);
    if (!match || !validVersion(match[2])) return false;
    const op = match[1] ?? "=";
    if (tokens.length > 1 && (op === "^" || op === "~")) return false;
    bounded ||= ["=", "^", "~", "<", "<="].includes(op);
  }
  return bounded;
}
export function matches(version, range) {
  return validVersion(version) && validRange(range) && satisfies(version, range);
}
export function validateWebManifest(value) {
  const issues = [];
  if (!validateShape(value)) {
    return validateShape.errors.map(error => ({ path: error.instancePath, message: error.message }));
  }
  const check = (ok, path, message) => { if (!ok) issues.push({ path, message }); };
  check(value.name === value.id && !value.name.startsWith("zero."), "id", "Invalid or reserved identity");
  check(validVersion(value.version), "version", "Invalid semantic version");
  check(validRange(value.engines.zero), "engines.zero", "Invalid host range");
  check(validRange(value.engines.api), "engines.api", "Invalid API range");
  check(value.main.endsWith(".html") && value.main.trim() === value.main
    && !/[\\\0:%?#]/.test(value.main) && value.main.split("/").every(s => s && s !== "." && s !== ".."), "main", "Unsafe HTML entry");
  check(value.permissions.includes("network") === (value.network !== undefined), "network", "Network scope and permission must match");
  for (const origin of value.network?.allowedOrigins ?? []) {
    let safe = false;
    try {
      const url = new URL(origin);
      safe = url.protocol === "https:" && url.origin === origin && !url.username && !url.password && !origin.includes("*");
    } catch { /* Report through the common diagnostic. */ }
    check(safe, "network.allowedOrigins", "Expected an exact HTTPS origin");
  }
  const c = value.contributes;
  const views = new Set(c.views.map(v => v.id));
  const commands = new Set((c.commands ?? []).map(v => v.id));
  const ids = new Set();
  for (const entry of [...c.views, ...(c.commands ?? []), ...(c.statusBarItems ?? [])]) {
    check(entry.id.startsWith(value.id + ".") && /^[a-z0-9][a-z0-9._-]{1,127}$/.test(entry.id) && !ids.has(entry.id), "contributes", "Invalid or duplicate contribution ID");
    ids.add(entry.id);
  }
  for (const command of c.commands ?? []) check(views.has(command.viewId), "contributes.commands", "Unknown view");
  const keys = new Set();
  for (const binding of c.keybindings ?? []) {
    check(commands.has(binding.command) && !keys.has(binding.command), "contributes.keybindings", "Unknown or repeated command");
    keys.add(binding.command);
  }
  for (const item of c.statusBarItems ?? []) check(commands.has(item.command), "contributes.statusBarItems", "Unknown command");
  const settings = new Set();
  for (const setting of c.settings ?? []) {
    check(!settings.has(setting.key), "contributes.settings", "Duplicate setting"); settings.add(setting.key);
  }
  for (const event of value.activationEvents) {
    check(event.startsWith("onView:") ? views.has(event.slice(7)) : event.startsWith("onCommand:") && commands.has(event.slice(10)), "activationEvents", "Unknown activation contribution");
  }
  return issues;
}
