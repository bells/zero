import assert from "node:assert/strict";
import {mkdtemp, readFile, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import {buildTools, createPreviewIndex} from "../../../scripts/plugin-packages/tools.mjs";

const unpack = async (file) => JSZip.loadAsync(await readFile(file));

test("a tool builds an official candidate and a scoped development archive with identical executable assets", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "zero-tool-package-test-"));
  try {
    const reports = await buildTools("snap", output);
    assert.equal(reports.length, 1);
    const {archive, preview} = reports[0];
    const officialZip = await unpack(archive.output);
    const previewZip = await unpack(preview.output);
    const official = JSON.parse(await officialZip.file("manifest.json").async("string"));
    const development = JSON.parse(await previewZip.file("manifest.json").async("string"));

    assert.equal(official.id, "zero.snap");
    assert.equal(development.id, "example.snap");
    assert.equal(development.name, development.id);
    assert.equal(development.version, official.version);
    assert.deepEqual(development.permissions, official.permissions);
    assert.deepEqual(development.requiredCapabilities, official.requiredCapabilities);
    assert.ok(development.contributes.views.every(view => view.id.startsWith("example.snap.")));
    assert.deepEqual(development.activationEvents, development.contributes.views.map(view => `onView:${view.id}`));
    assert.deepEqual(Object.keys(previewZip.files), Object.keys(officialZip.files));
    for (const name of Object.keys(officialZip.files).filter(name => name !== "manifest.json")) {
      assert.deepEqual(await previewZip.file(name).async("nodebuffer"), await officialZip.file(name).async("nodebuffer"));
    }
    await assert.rejects(buildTools("../snap", output), /Unknown tool/);
  } finally {
    await rm(output, {recursive: true, force: true});
  }
});

test("preview index binds each tag URL to the actual downloadable package bytes", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "zero-preview-index-test-"));
  const catalog = JSON.parse(await readFile(new URL("../../../market.json", import.meta.url), "utf8")).catalog;
  const previewRoot = path.join(output, "artifact", "preview");
  try {
    await mkdir(previewRoot, {recursive: true});
    for (const item of catalog) {
      const id = item.name.replace("zero.", "example.");
      const zip = new JSZip();
      zip.file("index.html", "<!doctype html><title>Zero</title>");
      zip.file("manifest.json", JSON.stringify({
        schemaVersion: 2, id, name: id, displayName: item.displayName, version: item.version, author: "Zero",
        description: "Test preview", engines: {zero: ">=0.2.0 <0.3.0", api: "^1.0.0"},
        platforms: ["macos"], runtime: "webview", main: "index.html", permissions: ["storage.plugin"],
        contributes: {views: [{id: `${id}.main`, title: item.displayName, surface: "main"}]},
        activationEvents: [`onView:${id}.main`],
      }));
      await writeFile(path.join(previewRoot, `${id}-${item.version}.zplugin`), await zip.generateAsync({type: "nodebuffer"}));
    }

    const index = await createPreviewIndex(output, "bells/zero", "plugin-preview-123-1");
    assert.deepEqual(index.plugins.map(entry => entry.name), catalog.map(item => item.name.replace("zero.", "example.")));
    for (const entry of index.plugins) {
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
      assert.equal(entry.downloadUrl, `https://github.com/bells/zero/releases/download/plugin-preview-123-1/${entry.name}-${entry.version}.zplugin`);
      assert.equal(entry.publisherSignature, undefined);
    }
    await assert.rejects(createPreviewIndex(output, "bells/zero", "bad/path"), /Invalid release tag/);
    await rm(path.join(previewRoot, "example.file-0.1.0.zplugin"));
    await assert.rejects(createPreviewIndex(output, "bells/zero", "plugin-preview-123-1"), /Missing preview archive/);
  } finally {
    await rm(output, {recursive: true, force: true});
  }
});
