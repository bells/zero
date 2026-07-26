## Context

Zero is a tray-first Tauri 2 desktop utility collection. The current code already has plugin-shaped folders for screenshot, caffeine, and preferences, but the actual plugin model is still static:

- `src/plugins/types.ts` defines `PluginId = "caffeine" | "screenshot"`.
- `src/App.tsx` owns the plugin array, rendering switch, selection state, preferences/about navigation, and visible-plugin count.
- `src/plugins/preferences/preferencesModel.ts` stores tool visibility in `localStorage` with a compile-time `Record<PluginId, boolean>`.
- Rust commands and services are split by feature, but plugin discovery, market refresh, package download, and lifecycle are not host concepts yet.

The first product milestone should not build a server-backed marketplace. The MVP is “Git as the market”: each plugin is an independent repository, authors publish compiled `.zplugin` archives through GitHub Releases, and Zero reads a preset GitHub-hosted `market.json` file containing release download metadata.

Because this is a local desktop app, the design must preserve Tauri's security boundary: React renders UI, Rust owns native capabilities, downloads, filesystem writes, archive extraction, process execution, and package validation; third-party plugin code cannot receive raw native access by default.

## Goals / Non-Goals

**Goals:**

- Define the MVP `.zplugin` package format and `manifest.json` contract.
- Support a static GitHub-hosted `market.json` index as the first plugin discovery/distribution mechanism.
- Let users install plugins from the market by downloading release assets and extracting them under `~/.zero/plugins/`.
- Make plugin discovery, install, uninstall, enable, disable, validation, and failure reporting runtime host capabilities.
- Migrate screenshot and caffeine into the same host-facing contract as bundled plugins while preserving existing behavior.
- Keep IPC contracts explicit and symmetric between Rust and TypeScript.
- Provide a safe initial host-mediated runtime for plugin entrypoints and permissions.

**Non-Goals:**

- Building a custom backend marketplace, account system, ratings, reviews, payments, moderation workflow, or server-side search in this change.
- Supporting automatic background updates in the first MVP; update can be a later explicit lifecycle operation.
- Allowing unrestricted shell execution, arbitrary native sidecars, or direct Tauri API access from plugins.
- Replacing official Tauri plugins such as autostart, opener, positioner, or global-shortcut.
- Rewriting screenshot capture, caffeine native behavior, or the main-window layout beyond what is needed to host dynamic plugin records.
- Guaranteeing mobile parity for every extension point in the first version; the API should remain mobile-aware, but desktop market install lands first.

## Decisions

### Decision 1: Use GitHub Releases plus a hosted market.json for the MVP market

The first market source is a static JSON document hosted in the Zero GitHub organization/repository. The app has a preset market URL and can refresh it on demand.

```json
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
      "sha256": "expected-release-asset-sha256",
      "permissions": ["clipboard.read"]
    }
  ]
}
```

Rationale: GitHub Releases gives authors distribution, version history, checksums/release notes, and hosting without Zero building marketplace infrastructure. A hosted `market.json` is also easy to review in pull requests.

Alternatives considered:

- Build a server-backed plugin marketplace first. This adds accounts, storage, moderation, APIs, and operations before the plugin protocol is proven.
- Only support local file install. This proves packaging but misses the “market” experience users expect.

### Decision 2: Keep the MVP manifest small but forward-compatible

Each `.zplugin` archive contains a root `manifest.json`. The required MVP fields are the user-facing minimum:

```json
{
  "name": "clipboard-helper",
  "version": "0.1.0",
  "author": "watson",
  "main": "dist/index.html",
  "permissions": ["clipboard.read", "network"]
}
```

`main` is a package-relative path to the plugin entrypoint. The entrypoint can represent a web UI asset, a script, or a binary program depending on runtime metadata. If runtime metadata is absent, the MVP treats it as a host-rendered web asset by default and refuses unsafe execution. Optional fields such as `id`, `displayName`, `description`, `engines`, `platforms`, `contributes`, and `runtime` can be added without changing the required MVP mental model.

Rationale: plugin authors get a simple first manifest, while the host still has room for VS Code/Codex-style contribution points later.

Alternatives considered:

- Start with a large VS Code-like manifest. This is expressive but too heavy for the first public plugin authoring path.
- Use only `package.json`. This reuses npm conventions but does not clearly model native desktop permissions or Zero host compatibility.

### Decision 3: Rust owns market refresh, downloads, archive extraction, and registry writes

The plugin lifecycle uses explicit Tauri commands backed by Rust services:

```rust
#[tauri::command]
async fn refresh_plugin_market() -> Result<PluginMarketSnapshot, String>;

#[tauri::command]
async fn list_market_plugins() -> Result<Vec<PluginMarketEntry>, String>;

#[tauri::command]
async fn list_plugins() -> Result<Vec<PluginRecord>, String>;

#[tauri::command]
async fn validate_plugin_package(input: ValidatePluginPackageInput) -> Result<PluginValidationReport, String>;

#[tauri::command]
async fn install_market_plugin(input: InstallMarketPluginInput) -> Result<PluginRecord, String>;

#[tauri::command]
async fn install_plugin_package(input: InstallPluginPackageInput) -> Result<PluginRecord, String>;

#[tauri::command]
async fn uninstall_plugin(input: PluginIdentityInput) -> Result<PluginLifecycleResult, String>;

#[tauri::command]
async fn set_plugin_enabled(input: SetPluginEnabledInput) -> Result<PluginRecord, String>;
```

The frontend calls these through a typed service:

```ts
export interface PluginMarketEntry {
  name: string;
  version: string;
  author: string;
  description?: string;
  repository: string;
  releaseUrl: string;
  downloadUrl: string;
  sha256?: string;
  permissions: PluginPermission[];
  installedVersion?: string;
}

export const pluginHostService = {
  refreshMarket(): Promise<PluginMarketSnapshot> {
    return invoke<PluginMarketSnapshot>("refresh_plugin_market");
  },
  installMarketPlugin(input: InstallMarketPluginInput): Promise<PluginRecord> {
    return invoke<PluginRecord>("install_market_plugin", { input });
  },
};
```

Rationale: market refresh and package install are network/filesystem/trust-sensitive. Rust can apply proxy-aware HTTP behavior, validate URLs, check checksums, prevent path traversal during extraction, write only under the plugin root, and return typed state to React.

Alternatives considered:

- Let the frontend download and unzip packages. Browser APIs inside Tauri are the wrong trust boundary for filesystem writes and archive extraction.
- Let plugin packages install themselves. That would give untrusted code too much control before validation.

### Decision 4: Install packages under ~/.zero/plugins/ with a defensive path resolver

The MVP install root is `~/.zero/plugins/`. Installed packages are extracted into a plugin/version-scoped directory, for example:

```text
~/.zero/plugins/
  clipboard-helper/
    0.1.0/
      manifest.json
      dist/index.html
      ...
```

The Rust service must resolve this path defensively, create directories as needed, and reject archives containing absolute paths, parent-directory traversal, symlinks that escape the plugin directory, or files that overwrite another plugin.

Rationale: the explicit path matches the lightweight power-user mental model and is easy to inspect during MVP development.

Alternatives considered:

- Use only the platform app-data directory. This is more native, but `~/.zero/plugins/` is simpler for early plugin authors and debugging.
- Extract directly into a single current directory per plugin. Version-scoped directories make rollback and update design easier later.

### Decision 5: Keep plugin execution host-mediated, especially for binary/script main paths

The manifest's `main` field can point to a binary program or script path, but the MVP must not execute arbitrary plugin code with unrestricted privileges. Execution rules:

- the `main` path must stay inside the extracted plugin directory;
- plugin runtime type must be known before execution;
- binary/script execution must require declared permissions and user approval;
- the host launches commands directly, not through a shell string;
- execution should have timeout, cancellation, stdout/stderr capture, and structured error reporting;
- plugin UI/web assets continue to use an isolated extension surface and message bridge.

Rationale: the user-requested manifest supports binary/script tools, but local desktop plugins are a trust boundary. Zero should allow the shape without making the dangerous path the default.

Alternatives considered:

- Forbid binary/script entrypoints in v1. This is safer but weakens the “tool plugin” story.
- Execute `main` directly after install. This is too risky and makes permission declarations meaningless.

### Decision 6: Support bundled and installed plugins through one registry model

The registry distinguishes plugin source, but not shell behavior:

- `bundled`: shipped with the app bundle, e.g. screenshot and caffeine.
- `market`: downloaded from `market.json`/GitHub Releases and extracted under `~/.zero/plugins/`.
- `local`: installed from a local `.zplugin` file.
- `development`: loaded from a local folder during plugin authoring.

Bundled plugins are preinstalled in the registry on first launch. A user uninstalling a bundled plugin removes it from the active registry but does not delete app-bundled assets; the UI can offer a restore-defaults action. Preferences/about remain host surfaces, not removable plugins.

Rationale: users get the same install/uninstall mental model for tools, while the implementation remains honest about app-bundled code.

### Decision 7: Make contributions drive shell rendering and preferences

The main shell should render plugin cards, status, primary content, commands, and settings from normalized registry records and manifest contributions. The first implementation can keep a renderer map for bundled plugins:

```ts
const builtinRenderers: Record<string, BuiltinPluginRenderer> = {
  "zero.snap": ScreenshotPanel,
  "zero.awake": CaffeinePanel,
};
```

Installed plugin views use the generic extension surface. Tool visibility preferences move from `Record<PluginId, boolean>` to registry-backed user settings keyed by plugin name/id. If no plugin is enabled, the shell displays an empty state with market install and restore-defaults actions.

Rationale: the shell becomes a host for plugin contributions instead of a switch statement. Existing panels can migrate incrementally while market-installed plugins use the same card/list/detail path.

## Risks / Trade-offs

- [Risk] GitHub-hosted `market.json` becomes unavailable → Mitigation: cache the last valid market snapshot and allow local `.zplugin` install.
- [Risk] A release asset changes after the index is published → Mitigation: support `sha256` in `market.json` and reject mismatched downloads when present.
- [Risk] Dynamic plugin UI or binary/script entrypoints destabilize the shell → Mitigation: isolate third-party views, gate binary/script execution, mark failed plugins, and keep host navigation/preferences available.
- [Risk] Permission prompts become vague or too permissive → Mitigation: use a small permission vocabulary first, deny undeclared requests, and show permission diffs before install/update.
- [Risk] Archive extraction creates path traversal or overwrite bugs → Mitigation: canonicalize paths, reject absolute/parent paths, reject unsafe symlinks, and extract into a staging directory before registry activation.
- [Risk] Registry corruption prevents startup → Mitigation: Rust loads registry defensively, keeps a backup, skips invalid records, and always exposes preferences/about plus restore defaults.
- [Risk] API versioning blocks plugin authors too often → Mitigation: separate host version from Extension API version and provide clear incompatible-state messaging.
- [Risk] Mobile support is underspecified → Mitigation: keep manifest fields platform-aware and allow plugins to declare supported targets, but gate desktop-only capabilities explicitly.

## Migration Plan

1. Add shared TypeScript and Rust data contracts for `manifest.json`, `market.json`, market entries, permissions, plugin records, lifecycle status, validation reports, and download/install errors.
2. Add manifest and market index validators with fixtures for valid packages, invalid manifests, incompatible host/API versions, unsafe `main` paths, unsupported permissions, bad URLs, and checksum mismatch.
3. Add Rust market services that fetch the preset GitHub-hosted `market.json`, cache the last valid snapshot, and expose market entries to the frontend.
4. Add Rust plugin registry services that seed bundled screenshot/caffeine records, persist user lifecycle state, resolve `~/.zero/plugins/`, and expose `list_plugins`.
5. Add local `.zplugin` validation/extraction and market-driven download/install commands, including permission review and structured validation errors.
6. Refactor `src/App.tsx`, `src/plugins/types.ts`, preferences model, about panel, and shell tests to consume registry-backed plugin records instead of compile-time `PluginId` lists.
7. Add bundled adapters for screenshot and caffeine so existing UI and native commands continue to behave the same through the host contract.
8. Add the extension surface and message-based Extension API for installed plugin views, with cautious binary/script runtime support only after permissions and host execution guards are in place.
9. Add developer documentation, `manifest.json` and `market.json` examples, GitHub Release publishing guide, lifecycle tests, and a minimal example plugin repository/package.
10. Manually verify tray shell, standalone main window, preferences/about, market refresh, market install, local package install, uninstall, bundled restore, permission denial, checksum failure, and plugin failure isolation in `pnpm tauri dev`.

Rollback strategy: keep screenshot/caffeine bundled adapters as the compatibility path. If market-installed plugin loading causes instability, the host can disable market/local plugins through registry state while bundled plugins continue to render.

## Open Questions

- Should the package extension be exactly `.zplugin`, or should the host also accept `.zero-plugin` as an alias?
- Should `sha256` be required for every `market.json` entry in MVP, or optional but strongly recommended?
- What is the first preset `market.json` URL and review flow for adding plugin repositories to it?
- Which `main` runtimes should MVP support first: isolated web UI only, JavaScript script, native binary, or a subset?
- How much of the Codex plugin model should Zero support directly: skills, MCP configuration, app connectors, or only a generic metadata field in v1?
- Should plugin settings live in the Rust registry store, frontend localStorage, or a dedicated plugin storage service from day one?
