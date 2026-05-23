import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREFERENCES,
  getVisiblePluginIds,
  normalizePreferences,
  setToolVisibility,
} from "/private/tmp/ztool-preferences-test/src/plugins/preferences/preferencesModel.js";

test("normalizes missing visibility to all tools visible", () => {
  const preferences = normalizePreferences({}, ["screenshot", "caffeine"]);

  assert.deepEqual(preferences.visibleTools, {
    screenshot: true,
    caffeine: true,
  });
});

test("filters visible plugin ids from preferences", () => {
  const preferences = normalizePreferences(
    {
      visibleTools: {
        screenshot: false,
        caffeine: true,
      },
    },
    ["screenshot", "caffeine"],
  );

  assert.deepEqual(getVisiblePluginIds(["screenshot", "caffeine"], preferences), ["caffeine"]);
});

test("keeps the final visible tool enabled", () => {
  const preferences = normalizePreferences(
    {
      ...DEFAULT_PREFERENCES,
      visibleTools: {
        screenshot: true,
        caffeine: false,
      },
    },
    ["screenshot", "caffeine"],
  );

  const next = setToolVisibility(preferences, "screenshot", false, ["screenshot", "caffeine"]);

  assert.equal(next.visibleTools.screenshot, true);
  assert.equal(next.visibleTools.caffeine, false);
});
