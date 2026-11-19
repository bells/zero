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

## Official `zero.*` package signing (offline preparation)

Official Web packages require a separate `<archive>.signature.json` sidecar. The existing Rust verifier in `src-tauri/src/plugins/publisher.rs` defines the signature contract. The offline tool uses Node's Ed25519 implementation; it reads and checks one bounded snapshot of the selected archive, then derives the plugin ID/version from its validated manifest and SHA-256 from those exact bytes. It does not take identity, version, digest or publisher authority from CLI overrides or archive claims.

The default public authority is `src-tauri/plugin-publishers.json`. **Its publisher list is currently empty.** Therefore the normal host configuration cannot yet authorize an official package. Real key provisioning, reviewed public-key distribution to the host, native/package acceptance and release publication remain separate maintainer decisions. No production key is included or created by this tooling. Never copy the public synthetic test key into host trust.

After the maintainer has separately provisioned an Ed25519 private PEM key and distributed the corresponding public trust configuration, an explicit invocation is:

```sh
node scripts/plugin-packages/sign.mjs sign /absolute/output/zero.awake-1.0.0.zplugin \
  --key-id maintainer-selected-key-id \
  --private-key-file /absolute/private/location/publisher.pem
node scripts/plugin-packages/sign.mjs verify /absolute/output/zero.awake-1.0.0.zplugin
```

Signing requires both `--key-id` and `--private-key-file`. The private key must match the exact 32-byte Ed25519 public key authorized for that exact plugin ID. The tool reads the selected private key only for this explicit `sign` invocation; it never logs or writes private key material. The temporary input buffer is cleared after import, while Node/OpenSSL owns the imported key object's lifetime. Public verification does not read a private key. There is no key-generation, upload, trust-update or publication command.

Both commands accept `--trust-config /absolute/public/trust.json` for an explicitly selected public configuration, including isolated synthetic tests. This is a local verification input; it does not modify host trust or establish acceptance by a distributed Zero binary. The configuration uses the same strict schema as Rust:

```json
{
  "schemaVersion": 1,
  "publishers": [
    {
      "keyId": "maintainer-selected-key-id",
      "publicKey": "<canonical base64 of exactly 32 public Ed25519 key bytes>",
      "allowedPluginIds": ["zero.awake"]
    }
  ]
}
```

The placeholder above is deliberately invalid; use reviewed actual public authority for a real release. Unknown/duplicate fields, duplicate key IDs/allowed IDs, wildcard IDs, unsupported schemas, noncanonical base64 and weak keys fail closed. The trust configuration, private PEM and signature sidecar each have a 16 KiB read limit. Archives are capped at 16 MiB compressed and retain the existing checker’s 32 MiB expanded / 1024-entry / 60-second limits. Inputs must be regular files; symlink inputs are rejected where the platform supports `O_NOFOLLOW`.

The sidecar has exactly `schemaVersion: 1`, `keyId`, `pluginId`, `pluginVersion`, lowercase hexadecimal `sha256`, and canonical base64 `signature` (64 bytes). Signed bytes are ASCII `zero.official-plugin-package` followed by NUL, the u32 big-endian schema version, then `keyId`, `pluginId`, `pluginVersion` as u32 big-endian UTF-8 byte length plus bytes, and finally 32 raw digest bytes. JSON formatting is not signed. A fixed public archive/envelope/payload fixture in `tests/fixtures/plugin-publisher/wire-v1.json` is consumed by both Node and Rust tests.

Output is published beside the selected archive using an exclusive atomic link. An identical existing generated sidecar is an idempotent success; different content, an existing symlink or non-file is a conflict and is preserved. There is no force-overwrite flag. Unsupported filesystems fail without replacing the destination. If archive bytes change afterward, public verification rejects the sidecar; keep the signed archive and sidecar together and reverify before any later upload. The CLI exits nonzero on failure and reports `publisherVerified: true`, `releaseApproved: false` on success. A valid signature proves package identity and byte integrity; runtime compatibility, permission approval, native functionality, release acceptance and market publication remain independent gates.

离线准备说明：默认宿主公钥列表仍为空，本工具没有配置真实密钥或发布任何包。正式 `zero.*` 包必须使用维护者另行授权的 Ed25519 密钥、公钥配置和精确插件 ID；本地显式 `--trust-config` 验证不会改变宿主信任。签名只绑定实际归档、身份与版本，不代表设备验收、运行权限或发布批准。测试仅使用公开合成密钥，不得将其加入生产信任列表。
