# Zero MVP Plugin Protocol

This document records the legacy Git-based manifest and internal Extension API contracts. New Web plugins use the [Protocol v1 draft](protocol-v1.md) with manifest schema 2 and API `1.0.0`. Host `0.1.0` does not enable the public Web runtime; macOS debug probes are development evidence. Windows and packaged runtime verification remain pending.

The distribution design remains Git-based: a plugin repository can produce a compiled .zplugin package for GitHub Releases and a static market.json index. Publication does not establish runtime compatibility.

## Versions

- Zero host version for the first protocol draft: 0.1.0
- Legacy Extension API marker: string `"1"`, distinct from public API `1.0.0`
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
~/.zero/plugins/<plugin-name>/<plugin-version>/
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
- `engines.zero` (canonical)
- `engines.ztool` (legacy Extension API v1 alias)
- engines.api
- platforms
- runtime
- contributes

## Permissions

Legacy permission vocabulary (not the public Web v1 provider list):

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

The legacy internal Extension Bridge defines the following host-mediated resource methods. They are not exported by the public Web SDK. Its implemented development providers are `storage.get`, `storage.set`, and `ui.showMessage`; `network.fetch` returns `api.unavailable`. A legacy permission declaration cannot grant these internal native methods to a v2 package.

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

Launcher payloads use an exact-field contract. Paths, Bundle IDs, executable identities, command lines, shortcut targets, and URIs are invalid even when a plugin has launcher permissions. The Bridge checks ExtensionSurface identity, enabled state, declared permissions, and every approved permission required by the method before it touches the shared Rust launcher service. Cached application metadata and bounded success-only usage history stay under `~/.zero/data/quick-launcher/`; raw queries are never saved or uploaded.

The bundled Bing wallpaper tool calls trusted typed Tauri commands that reuse Rust network, storage, and wallpaper services. It is not a third-party SDK example. The new standalone plugin WebView uses a Rust-bound injected transport and session-scoped assets; its CSP allows only the narrow IPC connection. The former postMessage surface is not the current runtime path. Legacy script/binary execution is a separate process profile, outside public v1, and is not an OS sandbox.

## market.json

The MVP market is a static JSON file hosted by the Zero project.

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

The host validates an entry and its package before installation. The legacy market schema permits omitted sha256; v2 installation requires the reviewed package digest, supplied by the market entry or explicit local approval. A valid index entry does not bypass Host/API/platform/runtime checks.
