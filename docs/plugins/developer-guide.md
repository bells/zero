# ZTool Plugin Developer Guide

ZTool plugins are self-contained `.zplugin` ZIP archives. The MVP distribution model is intentionally Git-based: plugin authors build a package in their own repository, upload it to GitHub Releases, and ask the ZTool `market.json` index to reference that release asset.

## Package layout

```text
my-plugin.zplugin
  manifest.json
  dist/index.html
  dist/assets/...
```

The host extracts packages to:

```text
~/.ztool/plugins/<plugin-name>/<plugin-version>/
```

Archive entries must be package-relative. Absolute paths, `..` traversal, backslash paths, and symlinks are rejected.

## manifest.json

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
  "description": "A minimal ZTool plugin",
  "engines": {
    "ztool": "0.1.0",
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

The MVP permission vocabulary is:

| Permission | Purpose |
| --- | --- |
| `clipboard.read` | Read clipboard through the host bridge. |
| `clipboard.write` | Write clipboard through the host bridge. |
| `network` | Request host-mediated network access. |
| `storage.plugin` | Use plugin-scoped storage, commands, and settings. |
| `ui.message` | Show host-mediated messages and diagnostics. |
| `process.execute` | Request guarded binary/script execution. |
| `system.wallpaper` | Apply a validated plugin-owned image as the desktop wallpaper. |

Permissions are reviewed before install. The Extension API bridge denies undeclared or unapproved permissions.

## Native resource bridge

Plugins must never call unrestricted Tauri IPC, fetch arbitrary hosts, or write absolute paths. Use the Extension API request methods below; the host attaches the installed plugin identity and enforces enabled state plus declared and approved permissions.

```ts
await ztool.network.fetch({
  url: "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=10&mkt=zh-CN",
  method: "GET",
});

await ztool.storage.writeFile("images/today.jpg", imageBytes);
await ztool.system.setWallpaper("images/today.jpg");
```

The bridge message methods are `network.fetch`, `storage.writeFile`, and `system.setWallpaper`. Network access is HTTPS GET with host, redirect, timeout, private-address, and response-size policy. Storage paths are normalized relative paths inside the plugin data root; absolute paths, `..`, backslashes, symlink escapes, and oversized content fail. Wallpaper paths must refer to a bounded, decodable local image already inside that same data root.

Treat errors as structured host failures and surface `message` to the user; callers may use `code` and `retryable` for retry behavior. Never infer success from a completed UI click.

## Runtime and lifecycle

- `webview` plugins load through an isolated extension surface.
- `script` and `binary` entrypoints are guarded by Rust and require `process.execute`.
- The host launches process entrypoints directly with `Command::new`; shell-string interpolation is not allowed.
- Plugin failures are isolated. A failed plugin can be disabled, retried, or uninstalled without taking down preferences/about or other bundled plugins.

The bundled Bing wallpaper tool uses the existing `webview` runtime plus a built-in React renderer. ZTool does not currently provide a `plugin.wasm`/WASI runtime; declaring `main: "plugin.wasm"` will not make a package executable. Native network, storage, and wallpaper behavior remains in Rust services, while plugin UI and interaction state remain in React.

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
