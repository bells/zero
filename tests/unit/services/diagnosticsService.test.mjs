import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDiagnosticsService, diagnosticsErrorKey } from "/private/tmp/zero-tests/services/diagnosticsServiceCore.js";
import { parsePluginRequest } from "/private/tmp/zero-tests/core/pluginHost/protocol/requests.js";

for (const fixture of JSON.parse(fs.readFileSync("tests/fixtures/diagnostics/inputs.json", "utf8"))) {
  test(`diagnostic wire corpus: ${fixture.name}`, () => {
    const request = { protocolVersion:"1.0.0", requestId:"r1", sessionId:"s1", generation:1, method:"diagnostics.emit", payload:fixture.input };
    assert.equal(parsePluginRequest(request) !== null, fixture.valid);
  });
}
test("copy passes only the reviewed lease and issue action carries no content", async () => {
  const calls = [];
  const service = createDiagnosticsService(async (command, args) => { calls.push({ command, args }); });
  await service.copy("reviewed-id"); await service.openLink("issues"); await service.openDirectory();
  assert.deepEqual(calls, [
    {command:"copy_diagnostics_preview",args:{input:{previewId:"reviewed-id"}}},
    {command:"open_support_link",args:{input:{target:"issues"}}},
    {command:"open_diagnostics_directory",args:undefined},
  ]);
});
test("error presentation uses known keys without exposing exception contents", () => {
  const privateError = {code:"/Users/private",messageKey:"secret",message:"token=secret"};
  assert.equal(diagnosticsErrorKey(privateError), "diagnostics.error.unavailable");
  assert.equal(diagnosticsErrorKey({code:"previewExpired"}),"diagnostics.error.previewExpired");
  assert.equal(diagnosticsErrorKey(new Error("private")),"diagnostics.error.unavailable");
});
