import fs from "node:fs";
import { validateWebManifest, matches } from "./lib/plugin-protocol.mjs";

const [path, hostVersion, apiVersion] = process.argv.slice(2);
if (!path) {
  console.error("Usage: node scripts/validate-plugin-protocol.mjs manifest.json [host-version api-version]");
  process.exitCode = 2;
} else {
  try {
    const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
    const issues = validateWebManifest(manifest);
    if (!issues.length && hostVersion && !matches(hostVersion, manifest.engines.zero)) issues.push({ path: "engines.zero", message: "Host version is incompatible" });
    if (!issues.length && apiVersion && !matches(apiVersion, manifest.engines.api)) issues.push({ path: "engines.api", message: "API version is incompatible" });
    console.log(JSON.stringify({ valid: !issues.length, issues }, null, 2));
    process.exitCode = issues.length ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
