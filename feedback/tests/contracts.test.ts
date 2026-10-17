import assert from "node:assert/strict";
import test from "node:test";
import { parseCreate } from "../shared/contracts.ts";
const valid = {
  threadId: "tools/json",
  content: "  😀<img>\n![x](https://example.invalid)  ",
  idempotencyKey: "synthetic-attempt-00001",
};
test("trimmed literal Unicode body and empty personal details", () => {
  assert.equal(
    parseCreate(valid)?.content,
    "😀<img>\n![x](https://example.invalid)",
  );
  assert.equal(
    parseCreate({ ...valid, content: "😀".repeat(2000) })?.content.length,
    4000,
  );
  assert.equal(parseCreate({ ...valid, content: "😀".repeat(2001) }), null);
});
test("strict fields, thread and bounded optional details", () => {
  for (const patch of [
    { parentId: "a" },
    { role: "owner" },
    { status: "approved" },
    { threadId: "/en/tools/json" },
    { content: " " },
    { email: "x" },
    { nickname: "😀".repeat(41) },
    { email: "é".repeat(125) + "@x.invalid" },
    { idempotencyKey: "x" },
  ])
    assert.equal(parseCreate({ ...valid, ...patch }), null);
});
