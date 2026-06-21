## Context

ZTool 当前咖啡因模式是一个简单的二态开关：前端通过 invoke 调用 toggle_keep_awake(enabled)，Rust CaffeineState 保存 enabled 和 started_at，macOS 通过 caffeinate -d -i 保持唤醒，Windows 通过 SetThreadExecutionState 保持唤醒，其他平台返回 unsupported。

这次变更会跨越 React 面板、前端 hook、i18n、Tauri command 和 Rust service。核心约束是：计时到期必须由后端状态负责，不能依赖咖啡因面板是否正在渲染；前端只负责选择持续时长、显示已运行/剩余时间和触发状态切换。

## Goals / Non-Goals

**Goals:**

- 支持无期限、5 分钟、10 分钟、15 分钟、30 分钟、1 小时、2 小时、5 小时这些启动时长。
- 有限时长到期后自动关闭原生保持唤醒能力。
- 支持开启状态下重新选择时长，并从切换时重新计算到期时间。
- 在 CaffeineSnapshot 中暴露足够信息，让前端显示当前时长、已运行时间、剩余时间和到期状态。
- 保持现有 macOS/Windows/unsupported 平台分流。

**Non-Goals:**

- 不做任意输入的自定义分钟数；本次只做稳定预设。
- 不要求 ZTool 退出后仍由系统级计划任务继续管理到期关闭。
- 不新增外部依赖。
- 不重构整个主窗口或插件系统。

## Decisions

### Decision 1: Duration contract uses optional minutes plus optional expiry timestamp

Extend CaffeineSnapshot with:

- duration_minutes: number | null
- expires_at_ms: number | null

For no-limit sessions, both are null. For finite sessions, duration_minutes records selected preset and expires_at_ms records backend-calculated expiry time.

Alternative considered: frontend only sends preset id and computes remaining time locally. Rejected because the backend must be source of truth for expiry and because UI timers can pause when the panel unmounts.

### Decision 2: Keep one caffeine command and extend its payload

Keep the existing toggle_keep_awake command name but extend its signature to accept an optional duration_minutes argument when enabled is true. Disabled requests ignore duration_minutes.

Expected frontend shape:

- enable no limit: invoke toggle_keep_awake with enabled true and duration_minutes null/omitted
- enable finite duration: invoke toggle_keep_awake with enabled true and duration_minutes set to one allowed preset
- disable: invoke toggle_keep_awake with enabled false

Alternative considered: create a new command such as set_caffeine_session. Rejected for this change because extending the current command keeps command registration and call sites small while still making the state transition explicit.

### Decision 3: Rust service owns expiry with a session generation guard

CaffeineState should track a monotonically increasing session_generation or session_id. Every enable/switch increments the generation. When a finite session starts, Rust schedules an async expiry task for the target timestamp. When the task wakes, it only disables caffeine if:

- the stored generation still matches the generation captured by the task
- the state is still enabled
- expires_at is still due

This prevents stale timers from disabling a newer session after the user switches duration or re-enables no-limit mode.

Alternative considered: frontend setTimeout auto-disables. Rejected because it fails if the panel is not mounted, the page reloads, or React state is stale.

### Decision 4: Validate duration presets in Rust and share the allowed list in TS

Rust should reject unsupported finite durations before enabling. TS should expose a small pure helper module for the preset list and label/formatting so UI rendering and tests stay simple.

Allowed finite durations:

- 5 minutes
- 10 minutes
- 15 minutes
- 30 minutes
- 60 minutes
- 120 minutes
- 300 minutes

Null means no limit.

Alternative considered: allow any positive integer duration. Rejected because the user request names common presets and the compact tray UI benefits from a bounded list.

### Decision 5: Frontend displays elapsed and remaining separately

The caffeine panel should keep the existing elapsed display and add duration/remaining context:

- no limit: show active status and elapsed time, with no expiry countdown
- finite duration: show selected duration and remaining time
- expired state: after refresh or timer tick, show inactive state once backend reports disabled

The hook can keep its existing one-second interval while enabled. It should compute display-only remaining time from expires_at_ms and now, but the backend remains authoritative for actually turning caffeine off.

## Risks / Trade-offs

- Timer race between an old finite session and a newer session -> Use generation guard before auto-disabling.
- Backend timer is process-local -> If ZTool exits, process state is gone. This matches current non-persistent caffeine behavior and is acceptable for this change.
- System sleep behavior near expiry differs by OS -> Keep platform-specific apply_platform_awake behavior unchanged and test manual flows on supported platforms.
- Frontend countdown may briefly show zero before refresh sees disabled -> Trigger refresh when remaining reaches zero and rely on backend snapshot as truth.
- Unsupported platforms could expose duration UI even though enabling fails -> Keep current error path and ensure duration selection does not hide platform errors.

## Migration Plan

1. Add duration fields and validation to Rust caffeine state.
2. Extend toggle_keep_awake to accept optional duration_minutes.
3. Add expiry scheduling with generation guard and Rust tests for finite/no-limit/stale-timer state transitions.
4. Add TS duration presets and formatting helpers with focused Node tests.
5. Update useCaffeinePlugin and CaffeinePanel to select presets and show remaining time.
6. Add zh-CN/en-US i18n keys.
7. Verify with node tests, pnpm build, cargo check/test, git diff --check, and one manual pnpm tauri dev pass for the real panel.

Rollback is straightforward: revert the change artifacts/implementation and the app returns to the existing enabled/disabled caffeine behavior.

## Open Questions

- Should the UI remember the last selected duration across app restarts? This proposal treats persistence as out of scope unless explicitly requested.
- Should the tray/menu surface show remaining time outside the caffeine panel? Out of scope for the first implementation.
