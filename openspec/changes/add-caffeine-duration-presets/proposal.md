## Why

当前咖啡因模式只有开启/关闭两种状态，用户临时开会、下载、阅读或短时间离开时容易忘记手动关闭，导致设备长时间保持唤醒。增加“无期限 + 常用时长预设”可以保留一键开启的轻量体验，同时让临时场景自动结束。

## What Changes

- 咖啡因模式启动时支持选择持续时长：无期限、5 分钟、10 分钟、15 分钟、30 分钟、1 小时、2 小时、5 小时。
- 启动有限时长后，后端状态需要记录开始时间、预计结束时间和所选时长，并在到期后自动关闭保持唤醒。
- 前端咖啡因面板显示当前模式、已运行时间和剩余时间；无期限模式继续显示为持续开启。
- 用户可以在咖啡因已开启时切换到另一个时长，新的时长从切换时重新计算。
- 用户仍可随时手动关闭咖啡因模式。
- 到期、手动关闭和平台不支持/系统 API 失败都需要通过现有错误/状态反馈路径呈现。

## Capabilities

### New Capabilities

- caffeine-duration: Defines timed caffeine sessions, duration presets, remaining-time display, and automatic expiry behavior.

### Modified Capabilities

- None. There are no existing OpenSpec specs for caffeine behavior in this repository yet.

## Impact

- Frontend caffeine plugin:
  - src/plugins/caffeine/CaffeinePanel.tsx
  - src/plugins/caffeine/useCaffeinePlugin.ts
  - src/plugins/preferences/i18n.ts
- Rust caffeine command/service:
  - src-tauri/src/commands/caffeine.rs
  - src-tauri/src/services/caffeine.rs
- IPC contract:
  - CaffeineSnapshot response gains duration/expires-at fields.
  - toggle_keep_awake or a replacement command accepts the requested duration preset.
- Tests:
  - Add focused TypeScript tests for duration preset formatting/selection if helpers are extracted.
  - Add Rust unit tests for caffeine state expiry calculations and stale timer protection.
- Manual verification:
  - Run the real Tauri app and confirm manual enable/disable, timed expiry, and duration switching on supported platforms.
