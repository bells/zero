## Why

维护者重新体验主界面和托盘时，发现 File 空态箭头错位、Launch 就绪状态周期闪烁、窄窗口操作区换行，以及 Awake / Paper 底部多余留白。当前固定托盘高度与各插件不同的拉伸规则妨碍了紧凑快捷操作。

## What Changes

- 将 File 空态横线与箭头统一绘制，适用于主窗口及显示该空态的其他界面。
- 将 Launch 后台应用运行状态更新与索引加载反馈分开，保持就绪文案和数字快捷键稳定；保留实际搜索、手动刷新、错误和启动反馈。
- Launch 主窗口及托盘统一采用图标 / 名称与路径 / 操作与数字快捷键三列，超长文本省略并可查看完整路径。
- 五插件共用固定宽度、统一间距的自适应托盘：短内容收缩，长内容限高后单一内容区滚动；切换插件允许高度变化。
- macOS 面板主体贴近菜单栏下沿，尝试只让箭头区域上探；对准真实触发图标并保留屏幕边缘、多屏、DPI 及安全回退。

## Capabilities

### New Capabilities

- `desktop-tray-density`: 五插件自适应托盘、紧凑 Launch 结果、安静后台状态与 File 空态对齐。现有 Launch 和 popover 规范仍位于活跃变更，本增量明确衔接它们。

### Modified Capabilities

- `main-window-shell`: 在宿主窗口职责中补充有限、仅托盘可调用的自适应尺寸边界。

## Impact

- 宿主：`src/App.tsx`、`src/appShell/navigation.css`、`src/core/windowing/`；Rust `services/popover.rs`、`services/tool_windows.rs`、`commands/app.rs`、`lib.rs` 及相关 capability 检查。
- 插件：Launch hook / scheduling / view / CSS；File 空态；五插件仅在托盘所需的尺寸或滚动适配。
- 新增宿主托盘布局 IPC，Rust 校验尺寸、调用者与当前锚点；显式 TypeScript interface 对应 serde 字段。复用 Tauri 2、React、Lucide 和浏览器 ResizeObserver，不新增依赖。
- 接续 `refine-tray-popover-layout`、`refine-tray-and-workspace-navigation`、`add-quick-launcher-plugin` 及已有 Launch 数字快捷键实现。本次自适应高度替代旧变更“existing outer dimensions”的固定高度部分；顶部操作、原生菜单及快捷键安全约束保持。
- 不涉及官网、反馈、File 转换质量或发布策略、新插件、提交、推送、规范同步或归档。源码、自动化、macOS 原生与 Windows 验收分别记录。
