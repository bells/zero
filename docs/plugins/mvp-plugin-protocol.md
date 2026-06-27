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

Plugins must declare permissions before install. Undeclared permissions are denied by default.

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
