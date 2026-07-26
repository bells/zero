# Publishing Zero Plugins with GitHub Releases

The first Zero market is just Git plus a hosted `market.json`. There is no marketplace backend, login, rating system, payment system, or server-side search in the MVP.

## 1. Build your plugin package

Your repository should produce one `.zplugin` ZIP archive containing a root `manifest.json`.

```bash
node scripts/validate-plugin-package.mjs path/to/plugin-dir
cd path/to/plugin-dir
zip -r my-plugin.zplugin manifest.json dist README.md
```

## 2. Create a GitHub Release

Use a semver tag such as `v0.1.0`, then upload `my-plugin.zplugin` as a release asset.

Compute the checksum:

```bash
shasum -a 256 my-plugin.zplugin
```

## 3. Add the plugin to market.json

Submit a pull request to the hosted Zero market index with an entry like:

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "author": "watson",
  "description": "A minimal Zero plugin",
  "repository": "https://github.com/watson/my-plugin",
  "releaseUrl": "https://github.com/watson/my-plugin/releases/tag/v0.1.0",
  "downloadUrl": "https://github.com/watson/my-plugin/releases/download/v0.1.0/my-plugin.zplugin",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "permissions": ["ui.message"]
}
```

The host validates that repository, release, and download URLs are GitHub HTTPS URLs and that the asset ends with `.zplugin`.

## 4. Install from Zero

In Zero Preferences, open the Extensions section, refresh the Git-based market, review the requested permissions, and install.

If the market is offline, Zero keeps the last valid snapshot where available and still supports local `.zplugin` validation/install.
