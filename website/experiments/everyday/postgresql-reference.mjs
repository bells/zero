import { PGlite } from "../../../feedback/node_modules/@electric-sql/pglite/dist/index.js";
import { executeSql } from "../../src/lib/web-tools/sql.ts";
import assert from "node:assert/strict";
const db = new PGlite();
console.log((await db.query("select version()")).rows);
for (const query of [
  'SELECT $$two  spaces$$ AS "quoted  name", 2+3 AS sum;',
  "SELECT 'one'\n 'two' AS joined;",
  "SELECT 1 -- retain\n + 2 AS n;",
  "SELECT E'it\\'s  intact' AS s, 1 /* outer /* nested */ keep */ + 2 AS n;",
  "SELECT 'quoted  text' AS \"quoted  name\";",
]) {
  const expected = await db.query(query);
  for (const action of ["format", "compact"]) {
    const result = executeSql({ input: query, dialect: "postgresql", action });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual((await db.query(result.value.text)).rows, expected.rows);
    console.log(action, JSON.stringify(query), "PASS");
  }
}
await db.close();
