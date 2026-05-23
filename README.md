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
  i18n.test.mjs                   Language resolution and translation tests
  screenshotMeta.test.mjs         Screenshot metadata tests
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
pnpm build
cd src-tauri && cargo check && cargo test
```

## Notes

- `node_modules`, frontend build output, and Rust/Tauri build output are intentionally ignored.
- The login autostart preference uses the official Tauri autostart plugin.
- Screenshot annotation tools are intentionally phased: the UI direction is in place, while deeper annotation behavior can be implemented plugin by plugin.
