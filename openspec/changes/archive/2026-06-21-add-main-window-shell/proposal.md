## Why

ZTool 现在仍像一个紧凑托盘面板，偏好、关于和插件操作挤在同一个小窗口里。随着截图、咖啡因以及未来更多插件类型继续增加，ZTool 需要一个独立主界面来承载插件发现、状态总览和扩展导航，同时保留托盘入口的快速性。

## What Changes

- 增加独立的 ZTool 主界面入口，用户可从托盘面板底部中间的主按钮打开，而不是把所有工具都塞进状态栏浮窗。
- 保留托盘面板作为快速入口，并参考腾讯 Lemon 截图中的底部系统区：左侧偏好设置，中间打开 ZTool，右侧更多菜单承载关于 ZTool 与退出状态栏等系统动作。
- 将偏好设置和关于 ZTool 从当前主面板内联分支升级为独立页面或独立窗口，避免它们挤占插件工具区。
- 为未来插件类型丰富做主界面信息架构准备，包括插件导航、插件摘要、插件详情区域和系统操作入口。
- 调整 Tauri window/routing 设计，使 tray quick panel、main window、preferences page/window、about page/window 的标签、尺寸、焦点、任务栏和 capability 权限都有明确边界。
- 不移除现有截图、咖啡因、登录自启动、语言、工具显示开关、关于信息和退出能力。

## Capabilities

### New Capabilities

- main-window-shell: Defines the standalone main ZTool interface, tray quick panel bottom actions, separate preferences/about surfaces, and window-routing behavior for the app shell.

### Modified Capabilities

- None. There are no existing OpenSpec specs for the main app shell in this repository yet.

## Impact

- Frontend app shell:
  - src/main.tsx
  - src/App.tsx
  - src/App.css
  - src/plugins/types.ts
  - src/plugins/preferences/PreferencesPanel.tsx
  - src/plugins/preferences/AboutPanel.tsx
  - src/plugins/preferences/i18n.ts
- Frontend architecture:
  - likely add focused view/layout modules for tray quick panel, standalone main window, preferences, and about surfaces
  - keep plugin-specific UI close to each plugin while extracting app-shell navigation and system actions
- Tauri shell:
  - src-tauri/tauri.conf.json
  - src-tauri/capabilities/default.json
  - src-tauri/src/lib.rs
  - src-tauri/src/commands/app.rs if new window-opening commands are introduced
- IPC/window contract:
  - define explicit command or frontend API for opening/focusing the standalone main window, preferences, about, and quit action
  - keep Rust responsible for native window creation, focus, taskbar visibility, tray positioning, and failure handling
- Tests and verification:
  - update or add TypeScript tests for navigation/system action helpers if extracted
  - run node --test tests/*.mjs, pnpm build, cargo check, cargo test, and git diff --check
  - manually verify pnpm tauri dev with real tray toggle, open ZTool, preferences, about, quit, focus behavior, and window labels/capabilities
