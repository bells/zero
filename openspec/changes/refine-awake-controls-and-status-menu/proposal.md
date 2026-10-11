## Why

Zero Awake 的托盘面板以 POWER、圆形计时区和两行重复说明占据空间，开启／关闭按钮容易落在首屏之外；状态栏杯子仅靠一条液面线区分运行状态，快速辨认效果不足。用户希望参考 KeepingYouAwake 的空杯／实心杯反馈，在托盘和主窗口更直接地选择时长、查看计时与控制唤醒。

## What Changes

- 将 Awake 未运行／运行图标调整为空杯／实心杯，在相同杯体、手柄、底座和点击区域下形成清晰的单色状态对比，沿用 Zero 图标生成链。
- 按界面职责区分 Awake 布局：托盘保持简洁，主窗口恢复圆盘并充分利用工作区，不再限制为 480px 紧凑模块；两者共用会话状态与操作。移除 POWER、重复的休眠说明和“Zero Awake 已开启／关闭”，用紧凑状态与已运行、当前时长、有限会话剩余时间展示信息，开启／关闭按钮首屏可见。
- Awake 图标右键菜单依次提供无期限、5 分钟、10 分钟、15 分钟、30 分钟、1 小时、2 小时、5 小时，再提供“退出 Awake”和现有“退出 Zero 状态栏”。选择时长立即开启或替换当前会话，已运行会话的实际时长显示勾选。
- “退出 Awake”先停止原生防休眠并取消会话计时，再持久化隐藏 Awake 状态栏入口；Zero、其他工具及 Awake 主面板保留，用户可从设置恢复入口并重新开启。
- 原生菜单、图标、托盘和主窗口跟随 Rust 权威状态同步，保留隐藏界面的展示计时暂停及当前错误反馈。

## Capabilities

### New Capabilities

- `awake-status-controls`: Awake 状态图标的可辨识性、原生右键时长菜单、退出 Awake、恢复入口及跨界面状态同步。

### Modified Capabilities

- `caffeine-duration`: 明确托盘简洁、main 丰富的布局原则、首屏控制与计时反馈，同时保留所有时长、到期与跨端行为。

## Impact

- 前端：`src/plugins/caffeine/` 的 panel、hook、翻译与插件级样式；复用已有宿主布局、图标 mask、偏好和事件通道。
- 原生：`services/status_bar.rs` 的组合单元菜单与动作路由、`services/caffeine.rs` 和 `commands/caffeine.rs` 的统一会话转换／清理；状态栏可见性继续使用现有设置契约。
- 资产：Awake SVG masters、原生 PNG、contact sheet、图标结构校验和 `docs/icon-system.md`，无需添加依赖或移植 KeepingYouAwake 的 Objective-C 实现。
- 平台：macOS 原生组合状态栏右键菜单；Windows 保留单图标／动作行，通过共享 Awake 面板使用同等时长能力，需独立设备验收。不扩大 Linux/mobile 支持。
- 与 `refine-zero-icon-family` 的“一条液面线”状态规范有定向替代；沿用 `refine-tray-and-workspace-navigation` 的单行导航、保留工具上下文、局部高亮／tooltip 机制，以及 `systematic-performance-and-code-optimization` 的展示计时门控。仅此提案定义的新行为优先，不修改或归档其他变更。
- 本轮交付为 proposal、design、delta specs 和 tasks；实际 UI、图标和原生流程验收安排在实施阶段。
