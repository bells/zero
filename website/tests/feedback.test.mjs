import test from "node:test";
import assert from "node:assert/strict";
import {
  getFeedbackConfiguration,
  isFeedbackMessage,
} from "../src/lib/feedback/config.ts";
const valid = {
  PUBLIC_FEEDBACK_ENABLED: "1",
  PUBLIC_FEEDBACK_ORIGIN: "https://feedback.example.invalid",
  FEEDBACK_ALLOWED_ORIGINS:
    "https://feedback.example.invalid,https://preview-feedback.example.invalid",
};
test("explicit approved separate origin only, preview never falls back to production", () => {
  assert.deepEqual(getFeedbackConfiguration(valid, "https://www.usezero.cn"), {
    origin: "https://feedback.example.invalid",
  });
  for (const env of [
    {},
    { ...valid, PUBLIC_FEEDBACK_ENABLED: "0" },
    { ...valid, FEEDBACK_ALLOWED_ORIGINS: "" },
    { ...valid, PUBLIC_FEEDBACK_ORIGIN: "https://www.usezero.cn" },
    { ...valid, PUBLIC_FEEDBACK_ORIGIN: "http://feedback.example.invalid" },
    {
      ...valid,
      PUBLIC_FEEDBACK_ORIGIN: "https://feedback.example.invalid/path",
    },
    { ...valid, SITE_PREVIEW: "1" },
    {
      ...valid,
      VERCEL_ENV: "preview",
      PUBLIC_FEEDBACK_PREVIEW_ORIGIN: valid.PUBLIC_FEEDBACK_ORIGIN + "/",
    },
    {
      ...valid,
      VERCEL_ENV: "preview",
      PUBLIC_FEEDBACK_PREVIEW_ORIGIN: valid.PUBLIC_FEEDBACK_ORIGIN,
    },
  ])
    assert.equal(getFeedbackConfiguration(env, "https://www.usezero.cn"), null);
  assert.deepEqual(
    getFeedbackConfiguration(
      {
        ...valid,
        SITE_PREVIEW: "1",
        PUBLIC_FEEDBACK_PREVIEW_ORIGIN:
          "https://preview-feedback.example.invalid",
      },
      "https://www.usezero.cn",
    ),
    { origin: "https://preview-feedback.example.invalid" },
  );
});
test("strict versioned bounded frame messages", () => {
  for (const value of [
    { version: 1, type: "ready" },
    { version: 1, type: "resize", height: 240 },
    { version: 1, type: "resize", height: 1600 },
    { version: 1, type: "error", code: "timeout" },
  ])
    assert.equal(isFeedbackMessage(value), true);
  for (const value of [
    null,
    [],
    { version: 2, type: "ready" },
    { version: 1, type: "ready", data: "private" },
    { version: 1, type: "resize", height: Infinity },
    { version: 1, type: "resize", height: 1601 },
    { version: 1, type: "resize", height: 0 },
    { version: 1, type: "error", code: "url" },
    { version: 1, type: "navigate", url: "https://example.invalid" },
  ])
    assert.equal(isFeedbackMessage(value), false);
});
