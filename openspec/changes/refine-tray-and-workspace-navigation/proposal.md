## Why

用户提供的四张截图显示：托盘浮窗在点击外部后仍遮挡其他应用，macOS 状态栏的工具提示全部显示 Zero，工具卡片挤占托盘与主窗口空间，工作区又重复呈现插件名称。随着插件增加，需要让导航占用固定空间，并让用户快速识别工具、进入工作、返回其他应用。补充截图一/二还显示设置独立弹窗打断主窗口导航；用户另反馈点击单个状态栏工具时底部背景高亮覆盖整组图标。

## What Changes

- 托盘作为瞬态面板：点击其他窗口或桌面后自动隐藏，Escape 关闭；保留再次点击 Ø 的开关语义，并正确处理原生文件对话框、重新打开和异步任务。
- macOS 保留现有单一组合状态栏项，为每个可见工具单元显示对应名称，主 Ø 单元显示 Zero；收缩、展开和工具变更时同步提示区域。
- 托盘双列文字卡片替换为固定高度的单行图标工具栏；超出宽度后支持触控板横向滚动、触摸滑动、左右按钮和键盘访问，选中项自动进入可视区域。
- 主窗口左侧改为紧凑的图标与名称列表，增加展开/收缩按钮；收缩后保留图标、名称提示及选中状态，并记住用户选择。大量插件在侧栏内纵向滚动。
- 工作区取消宿主重复的插件标题、通用标签和静态绿色说明徽章，由插件内容负责唯一的可见标题及真实状态。Zero File 保留格式、引擎能力、任务队列和操作反馈，移除无操作价值的 LOCAL / SESSION 标签与重复容器。
- 偏好设置参考补充截图二的 ChatGPT 设置布局，改为主窗口内的完整设置视图：左侧分类与搜索，右侧当前设置内容；提供返回工具入口，保留工具选择、工作状态与原有设置能力。从托盘打开设置时显示或聚焦同一个 main，不再新建 preferences 原生窗口。
- macOS 点击工具状态栏单元时，按压及菜单/工具面激活的底部背景高亮仅覆盖该单元；点击主 Ø 时允许整组高亮。关闭、失焦、收缩和工具移除时清除过期高亮，沿用单一组合原生项。
- 使用项目 `impeccable` 的产品界面指导，复用现有图标资产、`lucide-react`、宿主组合层和插件懒加载机制；保留中英文、键盘焦点、可读对比度、44px 图标点击区域与 reduced-motion 支持。

## Capabilities

### New Capabilities

- `compact-plugin-navigation`: 托盘单行图标导航、溢出访问、工具名称提示，以及主窗口可收缩、可滚动的工具列表。
- `main-window-preferences`: 主窗口内设置视图、分类/搜索复用、返回工具上下文和跨窗口设置入口。
- `status-bar-cell-highlights`: macOS 单工具局部背景高亮、主 Ø 整组反馈和高亮生命周期。
- `status-bar-hover-labels`: macOS 组合状态栏内各工具单元的名称提示与布局同步，保留其他平台的单图标回退。

### Modified Capabilities

- `main-window-shell`: 新增托盘安全失焦隐藏与 Escape 行为、工作区唯一标题和内容滚动要求；将偏好设置入口重定向到 main 内设置视图，更新窗口路由与能力契约；保留原有底部操作、独立关于窗口和工具行为。

## Impact

- 前端：`src/App.tsx`、`src/App.css`、`src/main.tsx`/app surface 路由、`PreferencesSettingsCenter`、typed app-window service、导航组件与布局 hook、`src/appShell/bundledPluginModules.ts`、共享插件展示类型、偏好模型/存储/翻译、`src/plugins/file/FilePanel.tsx`。
- Rust：`lib.rs` 托盘显示入口、宿主瞬态窗口协调、`commands/app.rs`/主窗口导航交接、capability/caller checks、`surface_activity`、`services/status_bar.rs` 的组合单元/提示/高亮生命周期，以及现有原生对话框入口。新增 helper 放在服务层，command 保持薄层。
- 不新增插件业务 IPC 或第三方插件 manifest 字段；设置导航复用 `show_preferences_window` 的兼容入口并重定向 main，原生到前端的目标视图通知采用对称 Rust/TS 契约与 ready 后可靠交接。为 Escape 增加仅允许 tray 调用的隐藏窗口 Rust `Result` command、typed invoke，并核对 capability。侧栏状态属于前端偏好，不改变 Rust 状态栏设置。
- 与 `compact-and-collapse-status-bar-items`、`open-tool-surfaces-from-status-bar`、`refine-zero-icon-family`、`rename-ztool-to-zero`、`improve-about-and-add-diagnostics`、`optimize-preferences-settings` 交叠：沿用当前源码与其约束；本提案明确取代旧设置提案的独立 preferences 窗口承载方式，保留分类/搜索/反馈契约，不重写旧提案、不勾选旧实机任务、不归档。
- 本变更不改变 File 引擎审批、转换实现、插件权限/运行时、系统栏图标顺序或平台支持范围。原生交互需要 macOS/Windows 分别验证，规范校验不能代替实机证据。
