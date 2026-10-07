import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { matches, validateWebManifest } from "../../../scripts/lib/plugin-protocol.mjs";
import { protocolVersionMatches } from "/private/tmp/zero-tests/core/pluginHost/protocol/versions.js";

for (const fixture of JSON.parse(fs.readFileSync("tests/fixtures/plugin-protocol/versions.json", "utf8"))) {
  test(`protocol version corpus: ${fixture.name}`, () => {
    assert.equal(matches(fixture.version, fixture.range), fixture.matches);
    assert.equal(protocolVersionMatches(fixture.version, fixture.range), fixture.matches);
  });
}
for (const fixture of JSON.parse(fs.readFileSync("tests/fixtures/plugin-protocol/manifests.json", "utf8"))) {
  test(`protocol manifest corpus: ${fixture.name}`, () => {
    const issues = validateWebManifest(fixture.manifest);
    assert.equal(issues.length === 0, fixture.valid, JSON.stringify(issues));
  });
}

const { parsePluginRequest } = await import("/private/tmp/zero-tests/core/pluginHost/protocol/requests.js");
for (const fixture of JSON.parse(fs.readFileSync("tests/fixtures/plugin-protocol/requests.json", "utf8"))) {
  test(`protocol request corpus: ${fixture.name}`, () => {
    assert.equal(parsePluginRequest(fixture.request) !== null, fixture.valid);
  });
}
