import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
test("SDK builds with only SDK sources and declared dependencies", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zero-sdk-isolation-"));
  try {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
    fs.cpSync("src/sdk", path.join(root, "src"), { recursive: true });
    for (const name of ["react", "@types/react", "semver", "@types/semver"]) {
      const destination = path.join(root, "node_modules", name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(path.dirname(require.resolve(`${name}/package.json`)), destination,
        process.platform === "win32" ? "junction" : "dir");
    }
    execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "src/index.ts", "src/react.tsx",
      "--module", "ES2020", "--moduleResolution", "bundler", "--target", "ES2022", "--strict", "--skipLibCheck",
      "--jsx", "react-jsx", "--declaration", "--outDir", "dist"], { cwd: root, encoding: "utf8", stdio: "pipe" });
    const declarations = fs.readFileSync(path.join(root, "dist/index.d.ts"), "utf8");
    assert(!declarations.includes("../core/"));
    const { compareCapabilities } = await import(pathToFileURL(path.join(root, "dist/index.js")).href);
    for (const fixture of JSON.parse(fs.readFileSync("tests/fixtures/plugin-protocol/capabilities.json", "utf8"))) {
      const report = compareCapabilities(fixture.required, fixture.providers);
      assert.equal(report.compatible, fixture.compatible, fixture.name);
      assert.deepEqual(report.issues.map(issue => issue.code), fixture.codes, fixture.name);
      if (fixture.compatible) assert.deepEqual(report.capabilities, fixture.providers, fixture.name);
      for (const issue of report.issues.filter(issue => issue.code.startsWith("capability.") && issue.code !== "capability.invalid")) {
        assert.equal(issue.required, fixture.required[Number(issue.path.split(".").at(-1))].version);
        assert.equal(issue.actual, fixture.providers[0]?.version ?? null);
      }
    }

  } catch (error) {
    assert.fail(error.stdout?.toString() || error.message);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local SDK package exposes usable JavaScript and public declarations", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zero-sdk-package-"));
  const output = path.join(root, "sdk");
  try {
    execFileSync(process.execPath, ["scripts/build-plugin-sdk.mjs", "--output", output], { encoding: "utf8", stdio: "pipe" });
    assert(!fs.existsSync(path.join(output, "node_modules")));
    assert(!fs.existsSync(path.join(output, "core")));
    const consumer = path.join(root, "consumer");
    fs.mkdirSync(path.join(consumer, "node_modules", "@zero"), { recursive: true });
    fs.symlinkSync(output, path.join(consumer, "node_modules", "@zero", "sdk"), process.platform === "win32" ? "junction" : "dir");
    // Runtime peers and their type dependencies are installed in the independent workspace.
    for (const name of ["react", "@types/react", "semver", "@types/semver"]) {
      const destination = path.join(root, "node_modules", name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(path.dirname(require.resolve(`${name}/package.json`)), destination,
        process.platform === "win32" ? "junction" : "dir");
    }
    fs.writeFileSync(path.join(consumer, "consumer.mts"), `
      import { compareCapabilities, registerPlugin, emitDiagnostic, type PluginManifestV2, type HostCapability } from "@zero/sdk";
      import { useZeroPlugin } from "@zero/sdk/react";
      const providers: HostCapability[] = [{ id: "storage.plugin", version: "1.0.0" }];
      export const report = compareCapabilities([{ id: "storage.plugin", version: "^1.0.0" }], providers);
      export const background: PluginManifestV2["background"] = { main: "background.js", events: ["scheduled.daily"] };
      void registerPlugin; void emitDiagnostic; void useZeroPlugin;
    `);
    execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "consumer.mts", "--strict", "--noEmit",
      "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022"],
    { cwd: consumer, encoding: "utf8", stdio: "pipe" });
    const sdk = await import(pathToFileURL(path.join(output, "dist/index.js")).href);
    assert.deepEqual(sdk.compareCapabilities([], []), { compatible: true, capabilities: [], issues: [] });
  } catch (error) {
    assert.fail(error.stdout?.toString() || error.message);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
