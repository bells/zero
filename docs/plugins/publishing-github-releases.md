# Publishing Zero Plugins with GitHub Releases

The first Zero market is just Git plus a hosted `market.json`. There is no marketplace backend, login, rating system, payment system, or server-side search in the MVP.

Release status (2026-10-07): Host `0.1.0` keeps the public Web profile closed. Schema 2/API `1.0.0` and the proposed Host `>=0.2.0 <0.3.0` window remain draft; native Windows and packaged conformance are pending. See [Protocol v1](protocol-v1.md) before publishing a support claim. macOS debug packages and the legacy process profile are not public v1 release evidence; no SDK npm release exists.

## 1. Build your plugin package

Your repository should produce one `.zplugin` ZIP archive containing a root `manifest.json`.

The commands below validate the legacy directory shape. For schema 2, use the Protocol v1 manifest validator and the notes packaging example. Do not publish packages produced with `--development`, which targets the current debug Host override.

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

For schema 2, include the exact package SHA-256 and permissions. Installation binds approval to that digest and revalidates Host/API/platform/runtime compatibility. A market listing cannot enable the closed runtime or approve a first-party File engine; File keeps its independent signed-package and lease policy.

## 4. Install from Zero

In Zero Preferences, open the Extensions section, refresh the Git-based market, review the requested permissions, and install.

If the market is offline, Zero keeps the last valid snapshot where available and still supports local `.zplugin` validation/install.
