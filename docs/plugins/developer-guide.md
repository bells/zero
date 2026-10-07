# Zero Plugin Developer Guide

Zero plugins are self-contained `.zplugin` ZIP archives. The MVP distribution model is intentionally Git-based: plugin authors build a package in their own repository, upload it to GitHub Releases, and ask the Zero `market.json` index to reference that release asset.

Current status (2026-10-07): the public Web runtime is closed in Host `0.1.0`. Follow the [Protocol v1 draft](protocol-v1.md) for schema 2, the proposed `>=0.2.0 <0.3.0` Host window and API `^1.0.0`. Only macOS debug loading has development evidence; Windows/WebView2 and packaged conformance remain pending. The manifest examples and native Bridge vocabulary below describe the legacy format, not a stable SDK support promise.

## Web SDK development example

The [notes example](../../examples/plugin-notes/) uses only the public storage API. Its SDK core has no React or Tauri dependency; the optional React adapter is separate.

```ts
import { registerPlugin } from "../../src/sdk";

const registration = registerPlugin({
  async activate(context) {
    const result = await context.bridge.request("storage.get", { key: "note" });
    if (!result.ok) throw new Error(result.error.message);
  },
});
window.addEventListener("pagehide", () => registration.dispose(), { once: true });
```

The import above is for development inside this checkout; no npm SDK has been published. `storage.get/set` and `ui.showMessage` are implemented development methods. `network.fetch` and command registration currently fail with `api.unavailable`. Do not import unrestricted Tauri APIs into a plugin. The host authorizes every request from its native window/session binding, live grants and generation.

```bash
node scripts/validate-plugin-protocol.mjs examples/plugin-notes/manifest.json 0.2.0 1.0.0
node scripts/package-plugin-notes.mjs
# Explicit macOS debug package for the current Host only:
node scripts/package-plugin-notes.mjs --development
```

The development package changes its Host range to `>=0.1.0 <0.2.0`; it requires `ZERO_PLUGIN_WEB_DEV=1` in a debug build and is not a release package. The offline manifest validator checks structure and semantics, not installed-package authority or platform readiness. See Protocol v1 for legacy migration and the separate File signature/approval policy.

## Package layout

```text
my-plugin.zplugin
  manifest.json
  dist/index.html
  dist/assets/...
```

The host extracts packages to:

```text
~/.zero/plugins/<plugin-name>/<plugin-version>/
```

Archive entries must be package-relative. Absolute paths, `..` traversal, backslash paths, and symlinks are rejected.

## Legacy manifest.json

Required fields:

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "author": "watson",
  "main": "dist/index.html",
  "permissions": ["ui.message"]
}
```

Recommended optional fields:

```json
{
  "displayName": "My Plugin",
  "description": "A minimal Zero plugin",
  "engines": {
    "zero": "0.1.0",
    "api": "1"
  },
  "platforms": ["macos", "windows", "linux"],
  "runtime": "webview",
  "contributes": {
    "views": [{ "id": "my-plugin.main", "title": "My Plugin", "surface": "main" }],
    "commands": [{ "id": "my-plugin.hello", "title": "Say Hello" }],
    "settings": [
      { "key": "enabled", "type": "boolean", "default": true, "label": "Enabled" }
    ]
  }
}
```

## Permissions

The legacy permission vocabulary is:

| Permission | Purpose |
| --- | --- |
| `clipboard.read` | Read clipboard through the host bridge. |
| `clipboard.write` | Write clipboard through the host bridge. |
| `network` | Request host-mediated network access. |
| `storage.plugin` | Use plugin-scoped storage, commands, and settings. |
| `ui.message` | Show host-mediated messages and diagnostics. |
| `process.execute` | Request guarded binary/script execution. |
| `system.wallpaper` | Apply a validated plugin-owned image as the desktop wallpaper. |
| `system.apps.read` | Search the host-owned installed-application index and load indexed icons. |
| `system.apps.execute` | Launch an application selected by host-issued item ID. |
| `system.window.focus` | Focus a running indexed application; required together with app execution. |
| `system.settings.open` | Open a setting from the host-maintained system catalog. |

Permissions are reviewed before install. The Extension API bridge denies undeclared or unapproved permissions.

## Historical internal native resource bridge

The internal legacy Bridge contracts below are retained as reference for trusted adapters and old source tests. They are not public SDK methods. Plugins must never call unrestricted Tauri IPC, fetch arbitrary hosts, or write absolute paths.

```ts
await zero.network.fetch({
  url: "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=10&mkt=zh-CN",
  method: "GET",
});

await zero.storage.writeFile("images/today.jpg", imageBytes);
await zero.system.setWallpaper("images/today.jpg");
```

The bridge message methods are `network.fetch`, `storage.writeFile`, and `system.setWallpaper`. Network access is HTTPS GET with host, redirect, timeout, private-address, and response-size policy. Storage paths are normalized relative paths inside the plugin data root; absolute paths, `..`, backslashes, symlink escapes, and oversized content fail. Wallpaper paths must refer to a bounded, decodable local image already inside that same data root.

Launcher methods are `launcher.scanApps`, `launcher.search`, `launcher.launchOrFocus`, and `launcher.openSystemSetting`. Scan/search require `system.apps.read`; launch/focus requires both `system.apps.execute` and `system.window.focus`; settings require `system.settings.open`. Search accepts only `{ query, limit? }`, while activation accepts only `{ itemId, revision }`. The item ID must come from the current host index. Any extra path, Bundle ID, executable, command-line, shortcut-target, or URI field is rejected before native dispatch.

Launcher metadata and success-only usage weights remain local under `~/.zero/data/quick-launcher/`. The host does not persist raw queries or expose cache/usage files to isolated extensions. Launcher calls reuse the same Rust index/catalog/activation service as the bundled Zero Launch panel.

Treat errors as structured host failures and surface `message` to the user; callers may use `code` and `retryable` for retry behavior. Never infer success from a completed UI click.

## Runtime and lifecycle

- Schema 2 `webview` views open a standalone native WebView on demand through the debug-only runtime; main/tray hold launch entries. Legacy Web manifests are not supported by this new activation path.
- Legacy `script` and `binary` entrypoints are guarded by Rust and require `process.execute`; this process path is outside public v1 and is not an OS sandbox.
- The host launches process entrypoints directly with `Command::new`; shell-string interpolation is not allowed.
- Plugin failures are isolated. A failed plugin can be disabled, retried, or uninstalled without taking down preferences/about or other bundled plugins.

Bundled Bing wallpaper and Zero Launch use trusted build-time React modules and native adapters, not the external Web runtime. Their plugin-owned JSON metadata is shared by TS imports and Rust includes while code stays lazy. Zero does not provide a public WASM/WASI, sidecar or dynamic Rust runtime. Native network, storage, wallpaper, application, window, and setting behavior remains in Rust services.

Desktop wallpaper apply is available on macOS and Windows through the host adapter. Linux support depends on the active desktop and installed backend commands (for example GNOME/Unity/Pantheon, KDE, Cinnamon, MATE, XFCE, LXDE, Deepin, or the `swaybg`/`feh` fallback); plugins must handle `platform_unsupported`, missing dependency, and backend failure results. Mobile wallpaper apply is not part of Extension API version 1.

No Linux desktop environment was exercised manually for the Bing wallpaper change; the list above reflects the adapter's supported branches, while current automated CI covers macOS and Windows.

## Local validation

Validate an unpacked plugin directory before packaging:

```bash
node scripts/validate-plugin-package.mjs examples/plugins/minimal-view-command-setting
```

Create the release package from inside the plugin directory:

```bash
zip -r minimal-view-command-setting.zplugin manifest.json dist README.md
```
