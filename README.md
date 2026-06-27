# ZTool

ZTool is a tray-first desktop utility collection built with Tauri 2, React, and TypeScript. Each tool is designed as a plugin so the app can grow into a larger toolbox without turning the main window into a crowded control panel.

## Current Features

- Screenshot tool with selection preview, dimensions, toolbar actions, copy, and save entry points.
- Global screenshot shortcut: `CommandOrControl+Shift+A`.
- Caffeine mode to keep the screen and system awake.
- Preferences panel with real login autostart support.
- Tool visibility preferences so users can choose which plugins appear in the main tool list.
- Language preference with system default, Chinese, and English.
- About and Exit actions in a compact bottom system section.
- MVP plugin host: GitHub Releases `.zplugin` packages, hosted `market.json`, local package validation/install, permission review, enable/disable/uninstall, and bundled restore.

## Tech Stack

- Tauri 2
- Rust 2021
- React 19
- TypeScript
- Vite
- pnpm

## Prerequisites

- Node.js 18+
- pnpm
- Rust via `rustup`
- Platform build tools:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools and WebView2
  - Linux: WebKitGTK and app indicator dependencies required by Tauri

## Development

Install dependencies:

```bash
pnpm install
```

Run the frontend only:

```bash
pnpm dev
```

Run the desktop app:

```bash
pnpm tauri dev
```

Build the frontend:

```bash
pnpm build
```

Check the Rust side:

```bash
cd src-tauri
cargo check
cargo test
```

Build the desktop app:

```bash
pnpm tauri build
```

## Project Structure

```text
src/
  App.tsx                         Main tray shell
  App.css                         Application styling
  plugins/
    pluginHost/                   Runtime plugin registry, market, extension bridge, and host UI
    caffeine/                     Caffeine tool UI and state bridge
    screenshot/                   Screenshot tool UI and state bridge
    preferences/                  Preferences, about, and preference model
src-tauri/
  src/
    commands/                     Tauri command handlers
    services/                     Native service logic
  capabilities/                   Tauri permission capabilities
tests/
  preferencesModel.test.mjs       Preference model tests
  pluginHost*.test.mjs            Plugin host service/state tests
  extensionRuntime.test.mjs       Extension bridge and isolation tests
  i18n.test.mjs                   Language resolution and translation tests
  screenshotMeta.test.mjs         Screenshot metadata tests
```

## Plugin MVP

The first plugin market is repository-based, not server-backed:

- plugin authors publish a `.zplugin` ZIP archive in their own GitHub Releases;
- ZTool reads a hosted static `market.json`;
- install extracts packages under `~/.ztool/plugins/<plugin>/<version>/`;
- `manifest.json` requires `name`, `version`, `author`, `main`, and `permissions`;
- permissions are reviewed before install and enforced by a host-mediated Extension API bridge.

Developer docs:

- [MVP protocol](docs/plugins/mvp-plugin-protocol.md)
- [Developer guide](docs/plugins/developer-guide.md)
- [GitHub Releases publishing guide](docs/plugins/publishing-github-releases.md)
- [Minimal example plugin](examples/plugins/minimal-view-command-setting)

Validate an unpacked plugin directory:

```bash
node scripts/validate-plugin-package.mjs examples/plugins/minimal-view-command-setting
```

## Verification

Recommended checks before pushing:

```bash
pnpm exec tsc src/plugins/preferences/preferencesModel.ts src/plugins/types.ts --module ES2020 --moduleResolution bundler --target ES2020 --outDir /private/tmp/ztool-preferences-test --noEmit false --skipLibCheck
node --test tests/preferencesModel.test.mjs
pnpm exec tsc src/plugins/preferences/i18n.ts src/plugins/preferences/preferencesModel.ts --module ES2020 --moduleResolution bundler --target ES2020 --outDir /private/tmp/ztool-i18n-test --noEmit false --skipLibCheck
node --test tests/i18n.test.mjs
pnpm exec tsc src/plugins/screenshot/screenshotMeta.ts --module ES2020 --moduleResolution bundler --target ES2020 --outDir /private/tmp/ztool-screenshot-test --noEmit false --skipLibCheck
node --test tests/screenshotMeta.test.mjs
./node_modules/.bin/tsc src/plugins/pluginHost/contracts.ts src/plugins/pluginHost/pluginHostServiceCore.ts src/plugins/pluginHost/pluginHostModel.ts src/plugins/pluginHost/pluginMarketModel.ts src/plugins/pluginHost/extensionBridge.ts --module ES2020 --moduleResolution bundler --target ES2022 --outDir /private/tmp/ztool-plugin-host-test --noEmit false --skipLibCheck
node --test tests/pluginHostService.test.mjs tests/pluginHostModel.test.mjs tests/pluginMarketModel.test.mjs tests/extensionRuntime.test.mjs
pnpm build
cd src-tauri && cargo check && cargo test
```

## Notes

- `node_modules`, frontend build output, and Rust/Tauri build output are intentionally ignored.
- The login autostart preference uses the official Tauri autostart plugin.
- Screenshot annotation tools are intentionally phased: the UI direction is in place, while deeper annotation behavior can be implemented plugin by plugin.
