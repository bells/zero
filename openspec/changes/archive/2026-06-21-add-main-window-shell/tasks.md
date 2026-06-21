## 1. Window contract and native shell

- [x] 1.1 Define final Tauri window labels and options for tray, main, preferences, about, capture, and pin-* in src-tauri/tauri.conf.json and related Rust code.
- [x] 1.2 Update src-tauri/capabilities/default.json so every app-shell window label and required permission is explicit.
- [x] 1.3 Add or update Rust commands for opening/focusing main, preferences, and about windows with Result<(), String> error handling.
- [x] 1.4 Preserve existing tray icon toggle behavior while migrating it to the tray quick panel label.
- [x] 1.5 Review macOS activation/taskbar behavior so the standalone main window behaves like a real app window while tray remains lightweight.

## 2. Frontend routing and app-window service

- [x] 2.1 Add a typed frontend app-window service that wraps invoke calls for openMainWindow, openPreferencesWindow, openAboutWindow, and quitApp.
- [x] 2.2 Update src/main.tsx to route tray, main, preferences, about, capture, pin-*, and unknown labels to focused top-level components.
- [x] 2.3 Extract the current MainApp responsibilities into focused tray, main, and system-action components without duplicating plugin state logic.
- [x] 2.4 Ensure unknown labels render a safe app-shell fallback instead of crashing.

## 3. Tray quick panel

- [x] 3.1 Build the tray quick panel around compact plugin entry points and the existing visible-plugin preferences.
- [x] 3.2 Add the bottom action area with left preferences action, center open ZTool primary action, and right more action.
- [x] 3.3 Implement the more menu with about ZTool and exit status bar actions without clipping inside the tray panel.
- [x] 3.4 Surface command failures from open/focus/quit actions in a compact, non-blocking tray UI state.

## 4. Standalone main window

- [x] 4.1 Create the standalone main window page with plugin navigation, plugin summaries, and a plugin detail/work area.
- [x] 4.2 Reuse existing ScreenshotPanel and CaffeinePanel where practical while giving the main window a roomier layout than the tray quick panel.
- [x] 4.3 Keep selected plugin state local to the main window and avoid routing preferences/about as inline plugin views.
- [x] 4.4 Preserve tool visibility preferences in the main window and ensure at least one visible plugin is still enforced by the preferences model.

## 5. Preferences and about surfaces

- [x] 5.1 Create PreferencesWindowApp that reuses the existing PreferencesPanel, usePreferences hook, and i18n flow.
- [x] 5.2 Create AboutWindowApp that reuses the existing AboutPanel and app/plugin metadata.
- [x] 5.3 Add preferences/about entry points from both tray and main window surfaces.
- [x] 5.4 Verify closing preferences/about preserves tray and main plugin context.

## 6. Visual system and i18n

- [x] 6.1 Update src/App.css or split shell CSS so tray, main, preferences, about, capture, and pin styles remain understandable and scoped by surface.
- [x] 6.2 Apply the product UI direction: compact, readable, native-aware, with Lemon-inspired bottom action ergonomics but no fake metric dashboard.
- [x] 6.3 Add zh-CN and en-US strings for open ZTool, more actions, about ZTool, exit status bar, and any new shell labels.
- [x] 6.4 Add visible focus states, reduced-motion handling, and contrast-safe colors for new controls.

## 7. Verification

- [x] 7.1 Run node --test tests/*.mjs.
- [x] 7.2 Run pnpm build.
- [x] 7.3 Run cd src-tauri && cargo check && cargo test.
- [x] 7.4 Run git diff --check.
- [x] 7.5 Run pnpm tauri dev and manually verify tray toggle, open ZTool, preferences, about, more menu, exit status bar, screenshot capture, caffeine controls, and pin windows.
