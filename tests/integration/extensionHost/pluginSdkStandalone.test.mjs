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
      import { compareCapabilities, registerPlugin, emitDiagnostic, type PluginManifestV2, type HostCapability, type ZeroBridge } from "@zero/sdk";
      import { useZeroPlugin } from "@zero/sdk/react";
      const providers: HostCapability[] = [{ id: "storage.plugin", version: "1.0.0" }];
      export const report = compareCapabilities([{ id: "storage.plugin", version: "^1.0.0" }], providers);
      export const background: PluginManifestV2["background"] = { main: "background.js", events: ["scheduled.daily"] };
      export const acquirePower = (bridge: ZeroBridge) => bridge.request("power.acquire", {durationMinutes:30});
      export const releasePower = (bridge: ZeroBridge) => bridge.request("power.release", {leaseId:"opaque",generation:1});
      export const powerStatus = (bridge: ZeroBridge) => bridge.request("power.status", {});
      export const fetchMetadata = (bridge: ZeroBridge) => bridge.request("network.fetch", {url:"https://example.com/data",method:"GET"});
      export const compareAndSet = (bridge: ZeroBridge) => bridge.request("storage.compareAndSet", {key:"prefs",expectedValue:null,value:{enabled:true}});
      export const startTask = (bridge: ZeroBridge) => bridge.request("power.startTask", {expectedGeneration:null,expectedConditionsRevision:null,schedule:{kind:"until",expiresAtMs:100000},conditions:{batteryThresholdPercent:10,stopOnLowPowerMode:true,allowLowBatteryStart:false}});
      void registerPlugin; void emitDiagnostic; void useZeroPlugin;
    `);
    execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "consumer.mts", "--strict", "--noEmit",
      "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022"],
    { cwd: consumer, encoding: "utf8", stdio: "pipe" });
    const sdk = await import(pathToFileURL(path.join(output, "dist/index.js")).href);
    assert.deepEqual(sdk.compareCapabilities([], []), { compatible: true, capabilities: [], issues: [] });
    const session = {sessionId:"power-session", generation:1,pluginId:"test.power",pluginVersion:"1.0.0",apiVersion:"1.0.0",surfaceId:"test.power.main",registryRevision:1};
    let value = {leaseId:"opaque-lease",generation:7,expiresAtMs:123456};
    const bridge = sdk.createZeroBridge({session,ready:async()=>session,cancel:async()=>{},
      request:async request=>({requestId:request.requestId,ok:true,value})},new AbortController().signal);
    assert.deepEqual(await bridge.request("power.acquire",{durationMinutes:30}),{ok:true,value});
    value = {status:200,contentType:"application/json",bodyBase64:"e30="};
    assert.deepEqual(await bridge.request("network.fetch",{url:"https://example.com/data",method:"GET"}),{ok:true,value});
    value = {status:404,contentType:null,bodyBase64:""};
    assert.deepEqual(await bridge.request("network.fetch",{url:"https://example.com/missing",method:"GET"}),{ok:true,value});
    for (const invalidNetwork of [{status:"200",contentType:null,bodyBase64:""},{status:200,bodyBase64:""},{status:200,contentType:null,bodyBase64:123}]) {
      value=invalidNetwork;
      assert.equal((await bridge.request("network.fetch",{url:"https://example.com/data",method:"GET"})).error.code,"transport.invalid");
    }

    value = {leases:[{leaseId:"opaque-lease",generation:7,expiresAtMs:null}]};
    assert.deepEqual(await bridge.request("power.status",{}),{ok:true,value});
    value = {generation:8,conditionsRevision:1,active:true,schedule:{kind:"duration",minutes:30},conditions:{batteryThresholdPercent:10,stopOnLowPowerMode:true,allowLowBatteryStart:false},startedAtMs:100,expiresAtMs:1800100,elapsedMs:0,remainingMs:1800000,batteryThresholdOverridden:false,protectionUnavailable:false,lastStopReason:null};
    assert.deepEqual(await bridge.request("power.taskStatus",{}),{ok:true,value});
    for (const invalidTask of [{...value,elapsedMs:-1},{...value,generation:9007199254740992},{...value,schedule:{kind:"duration",minutes:0}}]) {
      const valid = value; value=invalidTask;
      assert.equal((await bridge.request("power.taskStatus",{})).error.code,"transport.invalid"); value=valid;
    }
    value = {swapped:false,currentValue:{enabled:true}};
    assert.deepEqual(await bridge.request("storage.compareAndSet",{key:"prefs",expectedValue:null,value:{enabled:false}}),{ok:true,value});
    for(const invalidCas of [{swapped:true},{swapped:"yes",currentValue:null},null]) {
      value=invalidCas;
      assert.equal((await bridge.request("storage.compareAndSet",{key:"prefs",expectedValue:null,value:{}})).error.code,"transport.invalid");
    }
    for (const invalid of [{leaseId:"x",generation:-1,expiresAtMs:null},{leaseId:"x",generation:1,expiresAtMs:-1},null]) {
      value = invalid;
      assert.equal((await bridge.request("power.acquire",{durationMinutes:null})).error.code,"transport.invalid");
    }

  } catch (error) {
    assert.fail(error.stdout?.toString() || error.message);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
