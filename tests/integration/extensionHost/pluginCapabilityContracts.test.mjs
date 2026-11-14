import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { validateWebManifest } from "../../../scripts/lib/plugin-protocol.mjs";

const cases = JSON.parse(fs.readFileSync("tests/fixtures/plugin-protocol/capability-manifests.json", "utf8"));
for (const fixture of cases) {
  test(`capability manifest: ${fixture.name}`, () => {
    const issues = validateWebManifest(fixture.manifest);
    assert.equal(issues.length === 0, fixture.valid, JSON.stringify(issues));
  });
}

const validateShape = new Ajv2020({ strict: true }).compile(JSON.parse(fs.readFileSync("schemas/plugin-manifest-v2.schema.json", "utf8")));
for (const fixture of cases.filter(fixture => fixture.name.includes("background"))) {
  test(`background schema: ${fixture.name}`, () => {
    assert.equal(validateShape(fixture.manifest), fixture.valid, fixture.name);
  });
}
