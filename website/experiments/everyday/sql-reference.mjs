import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { executeSql } from "../../src/lib/web-tools/sql.ts";
const fixtures = [
  "SELECT 'two  spaces' AS \"quoted  name\", 2 + 3;",
  "SELECT 1 -- retain comment\n + 2;",
  "SELECT x'1234', 'it''s  intact', 1 /* keep  comment */ + 2;",
  "SELECT [quoted  name] FROM (SELECT 'value  here' AS [quoted  name]);",
];
const sqlite = (sql) => {
  const result = spawnSync("sqlite3", [":memory:"], {
    input: sql,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
console.log(
  spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).stdout.trim(),
);
for (const input of fixtures)
  for (const action of ["format", "compact"]) {
    const result = executeSql({ input, dialect: "sqlite", action });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(sqlite(input), sqlite(result.value.text));
    console.log(`PASS ${action} ${JSON.stringify(input)}`);
  }
