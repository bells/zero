# ZTool MVP Plugin Protocol

This draft defines the first Git-based plugin protocol for ZTool. The MVP keeps distribution simple: each plugin lives in its own GitHub repository, publishes a compiled .zplugin package through GitHub Releases, and can be listed in a static market.json index hosted by the ZTool project.

## Versions

- ZTool host version for the first protocol draft: 0.1.0
- Extension API version: 1
- Market schema version: 1

## Package Layout

A .zplugin package is an archive with manifest.json at the root.

~~~text
clipboard-helper.zplugin
  manifest.json
  dist/index.html
  dist/assets/...
~~~

The installed MVP path is:

~~~text
~/.ztool/plugins/<plugin-name>/<plugin-version>/
~~~

The installer must reject package entries that use absolute paths, parent-directory traversal, unsafe symlinks, or files that would overwrite another plugin.

## manifest.json

Required MVP fields:

~~~json
{
  "name": "clipboard-helper",
  "version": "0.1.0",
  "author": "watson",
  "main": "dist/index.html",
  "permissions": ["clipboard.read", "network"]
}
~~~

Field notes:

- name: stable lowercase plugin name, using letters, numbers, dots, underscores, or dashes.
- version: semantic version.
- author: plugin author or publisher.
- main: package-relative path to the plugin entrypoint. It must stay inside the extracted package directory.
- permissions: explicit host capabilities requested by the plugin.

Optional forward-compatible fields:

- id
- displayName
- description
- engines.ztool
- engines.api
- platforms
- runtime
- contributes

## Permissions

Supported MVP permissions:

| Permission | Meaning |
| --- | --- |
| clipboard.read | Read clipboard content through the host bridge. |
| clipboard.write | Write clipboard content through the host bridge. |
| network | Use host-mediated network access. |
| storage.plugin | Read/write plugin-scoped storage. |
| ui.message | Show host-mediated user messages. |
| process.execute | Request guarded binary/script execution. |
| system.wallpaper | Apply a validated image from the calling plugin's data root as desktop wallpaper. |
| system.apps.read | Search/read the bounded host application index and lazy icons. |
| system.apps.execute | Launch a host-indexed application by stable item ID. |
| system.window.focus | Focus a running indexed application; required with system.apps.execute. |
| system.settings.open | Open a host-catalog system setting by stable item ID. |

Plugins must declare permissions before install. Undeclared permissions are denied by default.

## Permissioned native resources

Extension API version 1 reserves three host-mediated resource methods. A request is accepted only when the permission is both present in the installed manifest and approved by the user; disabled plugins and identity mismatches are rejected before dispatch.

| Bridge method | Permission | Request payload | Host policy |
| --- | --- | --- | --- |
| `network.fetch` | `network` | `{ "url": "https://…", "method": "GET" }` | HTTPS GET only; host allowlist, redirect, timeout, response-size, loopback and private-address checks. |
| `storage.writeFile` | `storage.plugin` | `{ "relativePath": "images/today.jpg", "dataBase64": "…" }` | Normalized plugin-relative paths only; bounded bytes, staged replacement, and absolute/traversal/backslash/symlink escape rejection. |
| `system.setWallpaper` | `system.wallpaper` | `{ "relativePath": "images/today.jpg" }` | File must resolve inside the calling plugin's data root and decode as a bounded supported image. |
| `launcher.scanApps` | `system.apps.read` | `{}` | Returns the bounded current index snapshot; no raw paths or cache access. |
| `launcher.search` | `system.apps.read` | `{ "query": "wx", "limit": 24 }` | In-memory bounded search; query is not persisted. |
| `launcher.launchOrFocus` | `system.apps.execute` + `system.window.focus` | `{ "itemId": "app:…", "revision": 3 }` | Resolves only the host-issued current item and reports the truthful OS action. |
| `launcher.openSystemSetting` | `system.settings.open` | `{ "itemId": "setting:…", "revision": 3 }` | Resolves only a built-in catalog setting and its private platform URI. |

Responses use the standard bridge envelope `{ requestId, ok, result?, error? }`. Native failures include stable `code`, human-readable `message`, operation context, and retryability where the Rust service contract applies. These methods never grant a plugin arbitrary Tauri commands, absolute-path filesystem access, shell execution, or direct WebView networking.

Launcher payloads use an exact-field contract. Paths, Bundle IDs, executable identities, command lines, shortcut targets, and URIs are invalid even when a plugin has launcher permissions. The Bridge checks ExtensionSurface identity, enabled state, declared permissions, and every approved permission required by the method before it touches the shared Rust launcher service. Cached application metadata and bounded success-only usage history stay under `~/.ztool/data/quick-launcher/`; raw queries are never saved or uploaded.

The bundled Bing wallpaper tool is the reference implementation. Its React surface calls typed Tauri commands that reuse the same Rust network, storage, and wallpaper services. Isolated third-party WebViews retain `connect-src 'none'` and request native resources through the postMessage Extension Bridge.

## market.json

The MVP market is a static JSON file hosted by the ZTool project.

~~~json
{
  "schemaVersion": 1,
  "updatedAt": "2026-06-21T00:00:00Z",
  "plugins": [
    {
      "name": "clipboard-helper",
      "version": "0.1.0",
      "author": "watson",
      "description": "Clipboard helper plugin",
      "repository": "https://github.com/watson/clipboard-helper",
      "releaseUrl": "https://github.com/watson/clipboard-helper/releases/tag/v0.1.0",
      "downloadUrl": "https://github.com/watson/clipboard-helper/releases/download/v0.1.0/clipboard-helper.zplugin",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "permissions": ["clipboard.read"]
    }
  ]
}
~~~

The host should validate every entry before showing it as installable. sha256 is optional in the schema draft, but release entries should include it whenever possible.
