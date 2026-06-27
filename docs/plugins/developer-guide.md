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

Permissions are reviewed before install. The Extension API bridge denies undeclared or unapproved permissions.

## Runtime and lifecycle

- `webview` plugins load through an isolated extension surface.
- `script` and `binary` entrypoints are guarded by Rust and require `process.execute`.
- The host launches process entrypoints directly with `Command::new`; shell-string interpolation is not allowed.
- Plugin failures are isolated. A failed plugin can be disabled, retried, or uninstalled without taking down preferences/about or other bundled plugins.

## Local validation

Validate an unpacked plugin directory before packaging:

```bash
node scripts/validate-plugin-package.mjs examples/plugins/minimal-view-command-setting
```

Create the release package from inside the plugin directory:

```bash
zip -r minimal-view-command-setting.zplugin manifest.json dist README.md
```
