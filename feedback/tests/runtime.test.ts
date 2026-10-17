import test from "node:test";
import assert from "node:assert/strict";
import {
  readConfig,
  originOnly,
  trustedVercelSource,
} from "../server/runtime.ts";
test("preview and missing unsafe configuration fail closed", () => {
  assert.throws(() => readConfig({}));
  assert.throws(() => readConfig({ VERCEL: "1", FEEDBACK_ENV: "local" }));
  assert.throws(() =>
    readConfig({ VERCEL_ENV: "production", FEEDBACK_ENV: "local" }),
  );
  assert.throws(() =>
    readConfig({ FEEDBACK_ENV: "production", VERCEL_ENV: "preview" }),
  );
  for (const origin of [
    "http://feedback.example",
    "https://feedback.example/path",
    "https://user:password@feedback.example",
    "https://feedback.example/?query=1",
  ])
    assert.throws(() => originOnly(origin));
  const config = readConfig({ FEEDBACK_ENV: "local" });
  assert.equal(config.origin, "http://127.0.0.1:4323");
});
test("local does not trust forwarding headers and only Vercel metadata is accepted on Vercel", () => {
  const request = new Request("https://feedback.example", {
    headers: {
      "x-forwarded-for": "198.51.100.3",
      "x-vercel-forwarded-for": "198.51.100.4",
    },
  });
  assert.equal(trustedVercelSource(request, "0"), undefined);
  assert.equal(trustedVercelSource(request, "1"), "198.51.100.4");
  assert.equal(
    trustedVercelSource(
      new Request("https://feedback.example", {
        headers: { "x-vercel-forwarded-for": "bad, 198.51.100.5" },
      }),
      "1",
    ),
    undefined,
  );
});
