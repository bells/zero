import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGACY_PREFERENCES_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
  readStoredPreferences,
  writeCanonicalPreferences,
} from "/private/tmp/zero-tests/core/preferences/preferencesStorage.js";

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("canonical preferences win when both storage keys exist", () => {
  const storage = memoryStorage({
    [PREFERENCES_STORAGE_KEY]: JSON.stringify({ language: "en-US" }),
    [LEGACY_PREFERENCES_STORAGE_KEY]: JSON.stringify({ language: "zh-CN" }),
  });

  assert.equal(readStoredPreferences(storage).language, "en-US");
});

test("legacy preferences are read and retained while writes use only canonical key", () => {
  const legacy = JSON.stringify({ language: "zh-CN" });
  const storage = memoryStorage({
    [LEGACY_PREFERENCES_STORAGE_KEY]: legacy,
  });
  const preferences = readStoredPreferences(storage);

  writeCanonicalPreferences(storage, preferences);

  assert.equal(storage.values.get(LEGACY_PREFERENCES_STORAGE_KEY), legacy);
  assert.equal(
    JSON.parse(storage.values.get(PREFERENCES_STORAGE_KEY)).language,
    "zh-CN",
  );
});


test("failed layout preference write leaves the previously stored preferences intact", () => {
  const previous = JSON.stringify({ language: "zh-CN", mainSidebarCollapsed: false });
  const storage = memoryStorage({ [PREFERENCES_STORAGE_KEY]: previous });
  storage.setItem = () => { throw new Error("quota exceeded"); };
  assert.throws(() => writeCanonicalPreferences(storage, { language: "zh-CN", mainSidebarCollapsed: true }), /quota exceeded/);
  assert.equal(storage.values.get(PREFERENCES_STORAGE_KEY), previous);
});
