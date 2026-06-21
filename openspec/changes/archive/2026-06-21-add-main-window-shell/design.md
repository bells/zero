## Context

ZTool 当前的默认窗口是一个 400×500、透明、无边框、隐藏任务栏的托盘控制面板，Tauri 默认 label 为 main。React 入口在 src/main.tsx 根据 window label 路由到 MainApp、CaptureApp 或 PinApp；MainApp 同时承担插件列表、插件内容、偏好设置、关于和退出操作。这个形态适合早期托盘工具，但不适合后续插件类型变多后的主界面组织。

用户参考腾讯 Lemon 的截图，重点不是复刻系统监控数据，而是借鉴底部操作区的信息架构：左侧偏好设置，中间打开主应用，右侧更多菜单承载关于和退出状态栏。ZTool 需要保留托盘快速入口，同时新增一个可扩展的独立主界面，让偏好设置和关于 ZTool 成为独立页面或窗口。

本设计遵循 product UI register：设计服务于工具工作流。界面应该沉稳、紧凑、可信，不做营销页式大 hero，也不把 Lemon 的指标模块硬搬到 ZTool。

## Goals / Non-Goals

**Goals:**

- 将当前托盘面板收敛为 quick panel，负责快速插件入口和底部系统操作。
- 新增独立主窗口，用于插件总览、插件分类、插件详情和未来扩展。
- 将偏好设置和关于 ZTool 从 MainApp 内联视图拆成独立页面或窗口。
- 明确 Tauri window labels、窗口尺寸、任务栏/focus 行为和 capabilities。
- 保持截图、咖啡因、偏好、关于、退出等现有能力可用。
- 提供一个容易测试和继续拆分的 React 结构，避免 App.tsx 继续膨胀。

**Non-Goals:**

- 不在本变更中实现新的业务插件。
- 不重做截图编辑器、pin 窗口或咖啡因后端逻辑。
- 不新增 React Router、Zustand 或设计系统依赖，除非实现阶段确认现有结构无法承载。
- 不做 Lemon 系统监控克隆，CPU、风扇、磁盘和网络图表不属于本次范围。
- 不实现自动更新检查，右侧菜单可以预留“版本更新”位置，但不要求连接真实更新服务。

## Decisions

### Decision 1: Rename the current tray window role to tray and reserve main for the standalone app

The long-term model should use these labels:

- tray: compact status-bar quick panel, hidden from taskbar, transparent or visually attached to tray, opened by tray icon.
- main: standalone ZTool window, visible in taskbar/dock, resizable within sensible bounds, opened from tray panel's center action.
- preferences: independent preferences surface.
- about: independent about surface.
- capture: existing screenshot editor.
- pin-*: existing pinned screenshot windows.

Alternative considered: keep the current label main as the tray panel and create app for the standalone window. Rejected because main should mean the primary app surface in Tauri, tests, docs, and future mobile/desktop routing. A one-time label migration is cleaner than permanently explaining why main is only the tray popover.

Implementation note: if Tauri config migration risk is high, this can be staged by first adding a tray alias while preserving current main behavior, then switching the default configured window to tray in the same change before completion. The final observable contract should still expose main as the standalone interface.

### Decision 2: Rust owns window creation and focus; React calls a typed app-window service

React should not scatter WebviewWindow construction through components. Add thin Tauri commands such as show_main_window, show_preferences_window, show_about_window, and quit_app if existing quit_app remains. The commands should create or focus windows, apply native options, and return Result<(), String>.

Frontend should wrap these commands in a small TypeScript service, for example src/services/appWindows.ts, with explicit methods:

- openMainWindow()
- openPreferencesWindow()
- openAboutWindow()
- quitApp()

Alternative considered: instantiate windows directly from frontend with @tauri-apps/api/window. Rejected because window labels, taskbar behavior, decorations, focus, platform quirks, and capability drift belong at the Tauri boundary.

### Decision 3: Route by window label into focused page components

src/main.tsx should route labels to dedicated top-level pages:

- tray -> TrayPanelApp
- main -> MainWindowApp
- preferences -> PreferencesWindowApp
- about -> AboutWindowApp
- capture -> CaptureApp
- pin-* -> PinApp

MainApp can be split into smaller components rather than deleted at once:

- app-shell/tray/TrayPanel.tsx
- app-shell/main/MainWindow.tsx
- app-shell/system/BottomActionBar.tsx
- plugins/preferences/PreferencesPanel.tsx remains reusable inside PreferencesWindowApp
- plugins/preferences/AboutPanel.tsx remains reusable inside AboutWindowApp

Alternative considered: keep one App component with a mainView union. Rejected because it has already become responsible for unrelated surfaces and would become harder to test as more plugins arrive.

### Decision 4: Use Lemon only for bottom action ergonomics, not visual content

The tray panel bottom area should map to three stable regions:

- left icon button: open preferences
- center primary button: open ZTool
- right more button: show a compact menu with about ZTool and exit status bar

If the right menu needs implementation support, prefer a small fixed-position popover inside the tray window or a native menu if it better matches platform expectations. Avoid clipped absolute dropdowns inside overflow containers.

The visual direction should stay product-first: compact controls, readable labels, app icon in identity areas, enough contrast, no decorative metric chart modules unless a future plugin provides real data.

Alternative considered: copy Lemon's full panel structure with system metrics, privacy protection cards, and chart lines. Rejected because those modules do not map to ZTool's current plugin model and would make the app feel fake.

### Decision 5: Main window becomes the plugin home

The standalone main window should provide:

- plugin navigation with current visible plugins
- a summary area for selected plugin status and primary action
- a detail/work area that can host richer plugin pages over time
- persistent system access to preferences/about without hiding the selected plugin state

For the first implementation, reuse ScreenshotPanel and CaffeinePanel where practical, but place them in a roomier shell. Plugin metadata should remain explicit through PluginId and PluginMeta. If a plugin summary contract is needed, add it to src/plugins/types.ts and keep it small.

Alternative considered: make the standalone main window only a larger copy of the tray panel. Rejected because it would not solve future plugin scaling.

### Decision 6: Preferences and about become separate surfaces with reusable content

PreferencesWindowApp and AboutWindowApp should render focused pages that can be opened from tray and main. They should reuse the existing preference model, i18n, and panels where possible. Preferences remains the only surface that edits localStorage preferences and autostart state; about remains read-only, with app version and runtime information.

Alternative considered: modal overlays inside the main window. Rejected for the first pass because the user explicitly asked for separate pages and because independent windows avoid covering plugin workflows.

## Risks / Trade-offs

- Window label migration can break tray toggle or capture routing -> Update src/main.tsx, tauri.conf.json, lib.rs tray lookup, and capabilities together; add manual Tauri verification.
- Multiple windows can drift in preference state -> Keep preferences in the existing shared hook/model and rely on localStorage plus focused refresh behavior; avoid duplicating state models.
- Native window creation can fail silently if capabilities are incomplete -> Commands return Result and frontend surfaces errors where a user action triggered the open.
- A right-side menu inside a clipped tray panel can be cut off -> Use fixed positioning, popover behavior, or native menu semantics; test in the real Tauri window.
- Main window may become a generic dashboard -> Anchor it on plugin tasks and summaries, not decorative metrics.
- macOS Accessory activation policy may hide the standalone main from expected app switcher behavior -> Revisit activation policy when main window opens; if needed, switch activation policy while main/preferences/about are visible and restore tray-first behavior when only tray remains.

## Migration Plan

1. Create shared app-window service on the frontend and matching Rust commands for opening/focusing main, preferences, and about.
2. Update Tauri window definitions and capabilities for tray, main, preferences, about, capture, and pin-* labels.
3. Split React top-level routing by label and extract tray, main, preferences, about page components.
4. Implement the tray bottom action bar with left preferences, center open ZTool, and right more menu for about and quit.
5. Build the standalone main window shell around current plugin metadata and panels.
6. Move preferences/about out of MainApp inline branches and into independent routed surfaces.
7. Add or update i18n strings for open ZTool, more menu, about ZTool, exit status bar, and any new shell labels.
8. Run focused TypeScript tests if helpers are extracted, then node --test tests/*.mjs, pnpm build, cargo check, cargo test, and git diff --check.
9. Run pnpm tauri dev and manually verify tray toggle, open ZTool, preferences, about, menu positioning, quit, capture window, and pin window behavior.

Rollback is straightforward if the implementation is kept additive: revert the window-label/routing/service changes and return to the existing single main tray panel.

## Open Questions

- Should preferences/about be independent Tauri windows or routes inside the standalone main window for mobile builds? This design chooses independent desktop windows first, but the content components should stay reusable.
- Should the standalone main window be fixed size or resizable with minimum dimensions? This design recommends resizable with minimum bounds, but exact dimensions can be tuned during implementation.
- Should the right-side tray menu include “版本更新” immediately as a disabled/prepared item, or wait until an updater exists?
