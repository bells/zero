import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const plugins = [
  ["screenshot", "zero.snap", "plugins/screenshot", "accent-screenshot"],
  ["caffeine", "zero.awake", "plugins/caffeine", "accent-caffeine"],
  ["bingWallpaper", "zero.paper", "plugins/bingWallpaper", "accent-bing-wallpaper"],
  ["quickLauncher", "zero.launch", "plugins/quickLauncher", "accent-quick-launcher"],
  ["file", "zero.file", "plugins/file", "accent-file"],
];

test("each bundled plugin owns its manifest presentation localization and lazy renderer", () => {
  for (const [directory, id, main, accent] of plugins) {
    const source = fs.readFileSync(`src/plugins/${directory}/plugin.tsx`, "utf8");
    const metadata = JSON.parse(fs.readFileSync(`src/plugins/${directory}/metadata.json`, "utf8"));
    assert.equal(metadata.id, id);
    assert.equal(metadata.name, id);
    assert.equal(metadata.main, main);
    assert.match(source, new RegExp(`accentClass: ["']${accent}["']`));
    assert.match(source, /presentation:/);
    assert.match(source, /loadPanel:\s*\(\)\s*=>\s*import\(/);
    assert.ok(fs.existsSync(`src/plugins/${directory}/i18n.ts`));
    assert.match(source, /manifest: metadata/);
  }
});

test("dedicated surfaces and panels stay behind plugin-owned dynamic imports", () => {
  const main = fs.readFileSync("src/main.tsx", "utf8");
  assert.doesNotMatch(main, /from ["']\.\/App["']/);
  assert.doesNotMatch(main, /from ["']\.\/plugins\/file\/engine\/FileEngineApp["']/);
  assert.match(main, /lazy\(loadRoutedApp\)/);

  const screenshot = fs.readFileSync("src/plugins/screenshot/plugin.tsx", "utf8");
  assert.match(screenshot, /capture:\s*\(\)\s*=>\s*import\("\.\/capture\/CaptureApp"\)/);
  assert.match(screenshot, /pin:\s*\(\)\s*=>\s*import\("\.\/capture\/PinApp"\)/);
  assert.doesNotMatch(screenshot, /"snap-menu":\s*\(\)\s*=>\s*import\("\.\/SnapMenuApp"\)/);
  const launch = fs.readFileSync("src/plugins/quickLauncher/plugin.tsx", "utf8");
  assert.match(launch, /launcher:\s*\(\)\s*=>\s*import\("\.\/QuickLauncherApp"\)/);
  const paper = fs.readFileSync("src/plugins/bingWallpaper/plugin.tsx", "utf8");
  assert.match(paper, /paper:\s*\(\)\s*=>\s*import\("\.\/PaperApp"\)/);

  const boundary = fs.readFileSync("src/appShell/LazyPluginPanel.tsx", "utf8");
  assert.match(boundary, /<Suspense fallback=/);
  assert.match(boundary, /<DiagnosticBoundary/);
  const diagnosticBoundary = fs.readFileSync("src/appShell/DiagnosticBoundary.tsx", "utf8");
  assert.match(diagnosticBoundary, /getDerivedStateFromError/);
  assert.match(diagnosticBoundary, /emit_frontend_diagnostic/);
  assert.doesNotMatch(diagnosticBoundary, /_error\.(message|stack)/);
});

test("the app shell is the only composition root for concrete plugin descriptors", () => {
  const composition = fs.readFileSync(
    "src/appShell/bundledPluginModules.ts",
    "utf8",
  );
  for (const [directory] of plugins) {
    assert.match(composition, new RegExp(`plugins/${directory}/plugin`));
  }
  assert.match(composition, /createBundledPluginRegistry/);
  assert.match(composition, /createExtensionLauncherHostApis\(\s*quickLauncherService/);
});

test("plugin manifests keep host-mediated status bar contributions", () => {
  const combined = plugins
    .map(([directory]) => fs.readFileSync(`src/plugins/${directory}/metadata.json`, "utf8"))
    .join("\n");
  for (const contribution of [
    "zero.snap.status",
    "zero.awake.status",
    "zero.paper.status",
    "zero.launch.status",
  ]) {
    assert.match(combined, new RegExp(contribution.replaceAll(".", "\\.")));
  }
});

test("Zero File stays a trusted main-view plugin without extension permissions or a status item", () => {
  const metadata = JSON.parse(fs.readFileSync("src/plugins/file/metadata.json", "utf8"));
  assert.deepEqual(metadata.permissions, []);
  assert.deepEqual(metadata.platforms, ["macos", "windows"]);
  assert.equal(metadata.contributes.views[0].id, "zero.file.main");
  assert.equal(metadata.contributes.statusBarItems, undefined);
});

test("plugin lifecycle commands use host adapters and restore takes the bundled gates", () => {
  const commands = fs.readFileSync("src-tauri/src/commands/plugins.rs", "utf8");
  assert.doesNotMatch(commands, /services::(?:file|quick_launcher|screenshot|caffeine|bing_wallpaper)/);
  assert.doesNotMatch(commands, /sync_(?:quick_launcher|screenshot)_shortcut/);
  const restore = commands.slice(commands.indexOf("pub async fn restore_bundled_plugins"));
  assert.match(restore, /\.run_many\(/);
  assert.match(restore, /record\.source == crate::plugins::contracts::PluginSource::Bundled/);
  assert.match(restore, /publish_registry\(app, restored_ids, "restored"\)/);
});
