import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashInput } from "../src/lib/web-tools/hash.ts";
import { createQr } from "../src/lib/web-tools/qrcode.ts";
const value = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
test("incremental hash matches standard vectors at exact byte and chunk boundaries", async () => {
  for (const algorithm of ["md5", "sha1", "sha256", "sha512"]) {
    for (const input of ["", "abc", " 你好😀\r\n", "x".repeat(1024 * 1024)]) {
      const expected = createHash(algorithm).update(input).digest("hex");
      assert.equal(
        value(await hashInput({ mode: "text", input, algorithm, expected: "" }))
          .digest,
        expected,
      );
      assert.equal(
        value(
          await hashInput({
            mode: "file",
            file: new Blob([input]),
            algorithm,
            expected: expected.toUpperCase() + " \t",
          }),
        ).comparison,
        "match",
      );
    }
  }
  assert.equal(
    (
      await hashInput({
        mode: "text",
        input: "",
        algorithm: "sha256",
        expected: "x",
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await hashInput({
        mode: "text",
        input: "\ud800",
        algorithm: "sha256",
        expected: "",
      })
    ).ok,
    false,
  );
  assert.equal(
    value(
      await hashInput({
        mode: "text",
        input: "abc",
        algorithm: "sha256",
        expected: "0".repeat(64),
      }),
    ).comparison,
    "mismatch",
  );
});
test("QR matrix preserves Unicode and whitespace, M correction and controlled geometry", () => {
  const result = value(createQr(" 你好😀\n"));
  assert.ok(result.size > 0);
  assert.equal(result.modules.length, result.size ** 2);
  assert.match(result.svg, /viewBox/);
  assert.ok(!result.svg.includes("你好"));
  assert.equal(createQr("").ok, false);
  assert.equal(createQr("\ud800").ok, false);
  assert.equal(createQr("x".repeat(2000)).ok, true);
  assert.equal(createQr("x".repeat(2001)).ok, false);
});
