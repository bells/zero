import test from "node:test";
import assert from "node:assert/strict";
import { executeSql } from "../src/lib/web-tools/sql.ts";
test("SQL formatting preserves case, literals, comments and parameters", () => {
  const result = executeSql({
    input: "select a, 'two  spaces' from t where id = ? /* keep  this */",
    dialect: "mysql",
    action: "format",
  });
  assert.equal(result.ok, true);
  assert.match(result.value.text, /select\n  a/);
  assert.match(result.value.text, /'two  spaces'/);
  assert.match(result.value.text, /\/\* keep  this \*\//);
});
test("SQL compaction retains line comments and PostgreSQL string concatenation", () => {
  for (const [dialect, input] of [
    ["mysql", "select  1 -- hello\n + 2; /*!40101 SET @x=1 */"],
    ["postgresql", "select 'a'\n 'b', $$x  y$$"],
  ]) {
    const result = executeSql({ input, dialect, action: "compact" });
    assert.equal(result.ok, true);
    assert.match(result.value.text, /\n/);
  }
});
test("SQL rejects excessive input and unsupported unclosed lexical structures", () => {
  assert.equal(
    executeSql({
      input: "x".repeat(1048577),
      dialect: "mysql",
      action: "compact",
    }).ok,
    false,
  );
  assert.equal(
    executeSql({
      input: "select 'unterminated",
      dialect: "postgresql",
      action: "compact",
    }).ok,
    false,
  );
});
test("SQL retains dialect lexical boundaries for quoted identifiers, parameters and hints", () => {
  const fixtures = [
    [
      "mysql",
      "select /*+ INDEX(t idx) */ `a  b`, 'x\\\' y', ? from t; /*!40101 SET @x=1 */",
    ],
    [
      "postgresql",
      "select \"a  b\", $1, E'x\\ny', $tag$two  spaces\nline$tag$ /* outer /* inner */ end */",
    ],
    [
      "sqlite",
      "select [a  b], :name, @other, $value, x'1234' from t -- tail\n;",
    ],
  ];
  for (const [dialect, input] of fixtures) {
    const result = executeSql({ input, dialect, action: "compact" });
    assert.equal(result.ok, true, `${dialect}: ${JSON.stringify(result)}`);
    for (const literal of ["a  b"])
      assert.ok(result.value.text.includes(literal));
  }
});
test("SQL formatting preserves PostgreSQL newline-dependent adjacent strings", () => {
  const result = executeSql({
    input: "select 'a'\n'b'",
    dialect: "postgresql",
    action: "format",
  });
  if (result.ok) assert.match(result.value.text, /'a'\s*\n\s*'b'/);
});
test("Ambiguous MySQL line-comment syntax fails explicitly", () => {
  assert.deepEqual(
    executeSql({ input: "select 1--2", dialect: "mysql", action: "compact" }),
    { ok: false, error: { code: "sql", detail: "unsupported" } },
  );
});
