import assert from "node:assert/strict";
import test from "node:test";
import {
  createTranslator,
  resolveLanguage,
} from "/private/tmp/ztool-i18n-test/preferences/i18n.js";

test("resolves system language to Chinese for zh locales", () => {
  assert.equal(resolveLanguage("system", "zh-CN"), "zh-CN");
  assert.equal(resolveLanguage("system", "zh-Hant"), "zh-CN");
});

test("resolves system language to English for non-Chinese locales", () => {
  assert.equal(resolveLanguage("system", "en-US"), "en-US");
  assert.equal(resolveLanguage("system", "fr-FR"), "en-US");
});

test("explicit language overrides system language", () => {
  assert.equal(resolveLanguage("en-US", "zh-CN"), "en-US");
  assert.equal(resolveLanguage("zh-CN", "en-US"), "zh-CN");
});

test("translator returns localized labels", () => {
  assert.equal(createTranslator("zh-CN")("nav.preferences"), "偏好");
  assert.equal(createTranslator("en-US")("nav.preferences"), "Prefs");
});

test("Bing wallpaper metadata actions and states are translated", () => {
  const zh = createTranslator("zh-CN");
  const en = createTranslator("en-US");

  assert.equal(zh("plugin.bingWallpaper.title"), "Bing 壁纸");
  assert.equal(en("plugin.bingWallpaper.title"), "Bing Wallpaper");
  for (const key of [
    "wallpaper.download",
    "wallpaper.apply",
    "wallpaper.loading",
    "wallpaper.stale",
    "wallpaper.empty",
    "wallpaper.applied",
    "wallpaper.saved",
    "wallpaper.platformUnsupported",
  ]) {
    assert.notEqual(zh(key), key);
    assert.notEqual(en(key), key);
  }
});
