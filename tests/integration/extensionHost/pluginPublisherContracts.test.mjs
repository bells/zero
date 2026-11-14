import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const fixtures = JSON.parse(fs.readFileSync("tests/fixtures/plugin-publisher/signatures.json", "utf8"));
const schema = JSON.parse(fs.readFileSync("schemas/plugin-publisher-signature-v1.schema.json", "utf8"));
const validate = new Ajv2020({ strict: true }).compile(schema);
for (const fixture of fixtures.cases) {
  test(`publisher signature schema: ${fixture.name}`, () => {
    assert.equal(validate(fixture.envelope), fixture.shapeValid, JSON.stringify(validate.errors));
  });
}
