import { createMD5, createSHA1, createSHA256, createSHA512 } from "hash-wasm";
import { fail, textFits, type Result } from "./contracts.ts";
export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";
export type HashInput = { algorithm: HashAlgorithm; expected: string } & (
  | { mode: "text"; input: string }
  | { mode: "file"; file: Blob }
);
export interface HashValue {
  text: string;
  digest: string;
  comparison: "match" | "mismatch" | "none";
}
const algorithms = {
  md5: { create: createMD5, length: 32 },
  sha1: { create: createSHA1, length: 40 },
  sha256: { create: createSHA256, length: 64 },
  sha512: { create: createSHA512, length: 128 },
};
export async function hashInput(input: HashInput): Promise<Result<HashValue>> {
  const algorithm = algorithms[input.algorithm];
  if (!algorithm) return fail("digest", { detail: "algorithm" });
  const expected = input.expected.replace(
    /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g,
    "",
  );
  if (
    expected &&
    (!/^[a-f\d]+$/i.test(expected) || expected.length !== algorithm.length)
  )
    return fail("digest", { detail: "expected" });
  if (
    input.mode === "text" &&
    (!textFits(input.input) || !input.input.isWellFormed())
  )
    return fail(input.input.isWellFormed() ? "limit" : "utf8");
  if (input.mode === "file" && input.file.size > 256 * 1024 * 1024)
    return fail("limit");
  try {
    const hasher = await algorithm.create();
    hasher.init();
    if (input.mode === "text")
      hasher.update(new TextEncoder().encode(input.input));
    else {
      for (let offset = 0; offset < input.file.size; offset += 1024 * 1024) {
        const bytes = new Uint8Array(
          await input.file.slice(offset, offset + 1024 * 1024).arrayBuffer(),
        );
        hasher.update(bytes);
      }
    }
    const digest = hasher.digest("hex");
    const comparison = expected
      ? expected.toLowerCase() === digest
        ? "match"
        : "mismatch"
      : "none";
    return {
      ok: true,
      value: {
        digest,
        comparison,
        text: `${input.algorithm.toUpperCase()}\n${digest}`,
      },
    };
  } catch {
    return fail("digest", { detail: "engine" });
  }
}
