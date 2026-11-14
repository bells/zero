import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = fileURLToPath(new URL("../src/sdk/", import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output")) {
  throw new Error("Usage: node scripts/build-plugin-sdk.mjs [--output directory]");
}
const output = args.length ? path.resolve(args[1]) : fs.mkdtempSync(path.join(os.tmpdir(), "zero-plugin-sdk-"));
if (fs.existsSync(output) && (fs.lstatSync(output).isSymbolicLink() || fs.readdirSync(output).length)) {
  throw new Error("SDK output must be an empty directory");
}
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, output, { recursive: true, filter: file => !["node_modules", "dist"].includes(path.basename(file)) });
const manifest = JSON.parse(fs.readFileSync(path.join(output, "package.json"), "utf8"));
// The copied tree sees only declared packages; no symlink to the application's source or full node_modules.
const dependencies = new Set([
  ...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
]);
try {
  for (const name of dependencies) {
    const destination = path.join(output, "node_modules", name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(path.dirname(require.resolve(`${name}/package.json`)), destination,
      process.platform === "win32" ? "junction" : "dir");
  }
  execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"],
    { cwd: output, stdio: "inherit" });
} finally {
  // Build-time dependency links are local verification inputs, not package contents.
  fs.rmSync(path.join(output, "node_modules"), { recursive: true, force: true });
}
console.log(`Built isolated @zero/sdk: ${output}`);
