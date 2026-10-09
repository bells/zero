## 1. 原生状态栏名称提示

- [ ] 1.1 在当前组合状态栏上验证公开 AppKit tooltip rectangles 与现有 tracking 的兼容性，交付方案与限制记录；验收为跨工具/Ø 移动、停留、离开和布局刷新后均显示正确名称，不抢焦点、不改变点击。仅在同等实测通过时采用 design 中的事件更新替代。
- [x] 1.2 实现复用当前单元顺序的名称/区域解析 helper；Rust 测试覆盖 Ø、工具、收缩、隐藏/移除、空工具集合和边界坐标，名称与点击单元对应。
- [ ] 1.3 将 macOS tooltip adapter 接入创建、更新、收缩/展开、语言/metadata、lifecycle 与退出；检查主线程访问、owner/tag 清理和必要 Cargo feature，`cargo check --locked` 通过且刷新后无旧区域。
- [x] 1.4 保留现有组合宽度、右键菜单和非 macOS 主图标 fallback；现有状态栏测试通过，并在证据中单独记录跨平台编译和设备验证范围。

## 2. 托盘瞬态生命周期

- [x] 2.1 增加 host-owned tray 生命周期状态/展示 generation 与延后 dismissal helper，在 setup 注册一次事件；测试外部失焦、重新聚焦、旧 generation 和重复 Ø 点击最终状态。
- [x] 2.2 用既有 `show_surface`/`hide_surface` 接入 tray 显示/隐藏及 peer 瞬态窗口交接；现有窗口协调测试通过，main/pin/File engine 不受隐藏影响。
- [x] 2.3 为 tray 发起的原生选择/保存对话框接入按调用窗口关联的作用域 guard；测试成功、取消、错误、worker failure、嵌套计数和结束后的 dismissal，确认转换队列不因隐藏而被取消。
- [x] 2.4 增加 caller 限制为 tray 的 `hide_tray_quick_panel` command 和 `appWindows.hideTrayQuickPanel(): Promise<void>`；核对 handler/capability，测试非法调用窗口拒绝及正常 typed invoke 契约。
- [x] 2.5 接入 Escape 和更多菜单的逐层关闭，窗口切换清理局部弹层；实机或交互测试证明第一次 Escape 关闭菜单、下一次隐藏 tray，文件 modal 不被误关。

## 3. 紧凑工具导航

- [x] 3.1 定义 typed navigation icon 展示字段，在组合层映射现有品牌资产、File 的 Lucide 图标与 extension fallback；类型检查、模块边界和 lazy-import 契约检查通过，不增加第三方 manifest 字段或 eager 面板导入。
- [x] 3.2 提取宿主工具入口组件，加入完整名称、hover/focus 提示、独立选中/焦点及健康语义；检查中英文长名称、tooltip 不裁切和最小 44px 点击区。
- [x] 3.3 将 tray 改为紧凑头、52px 目标单行导航、独立内容滚动与固定系统动作；浏览器布局检查证明默认 400×500 的五工具不换行且底部动作可达。
- [ ] 3.4 实现原生水平滚动、溢出左右按钮、边界禁用、focus/selection 自动可见与 resize/list 变化重算；测试溢出/回退逻辑并交互验证 1/5/20/50 项以及触控板和键盘访问，卸载后无残余 observer/listener。
- [x] 3.5 保留非 macOS fallback row 的直接工具动作；回归测试证明选择插件和执行动作仍是不同语义，既有 preferences/open Zero/more 入口可用。

## 4. 可收缩主侧栏

- [x] 4.1 将展开导航改为紧凑图标名称列表，增加约 64px 收缩轨道与始终可达的 toggle；实际操作证明切换布局不重挂载当前插件或重置任务，短窗口内只有列表滚动。
- [x] 4.2 在既有偏好模型/归一化/更新链路增加 `mainSidebarCollapsed` 并处理保存失败；测试旧/无效数据默认、读取回写、其他字段保留和会话内失败反馈。
- [x] 4.3 将窄窗口导航改为自动紧凑轨道，宽窗口恢复保存模式；检查自动布局不持久化覆盖偏好，中文/英文、焦点和 selected visibility 在两种模式均正确。

## 5. 工作区去重

- [x] 5.1 删除宿主重复可见头和静态成功样式介绍，保留 workspace accessible name 并减少嵌套容器；检查所有五插件与通用/扩展/loading/error/empty fallback 均有清晰身份和状态。
- [x] 5.2 优化 Zero File 标题区，移除 LOCAL / SESSION，保留格式/队列、真实 provider、输入区、转换/取消及隐私说明；空队列、忙碌、错误、长队列的布局和既有 File 测试均通过。
- [ ] 5.3 补齐新控件中英文、对比度、visible focus 和 reduced-motion，检查主/托盘/独立工具面互不串样式；交互验收记录包含键盘与短/窄窗口状态。

## 6. 自动化集成门禁

- [x] 6.1 运行 `pnpm test` 和 `pnpm build`，记录真实结果；fixture preparation 不并发，失败先保留首轮结果再调查。
- [x] 6.2 运行 `cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo check --manifest-path src-tauri/Cargo.toml --locked` 与 `cargo test --manifest-path src-tauri/Cargo.toml --locked`；记录沙箱环境失败及合法串行/定向复测，不能弱化测试。
- [x] 6.3 构建后运行 `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json`，确认 bundle gate 通过、导航未破坏懒加载且未覆写历史 evidence。
- [x] 6.4 运行 `openspec validate --all --strict`、本变更严格校验与 `git diff --check`；检查只包含本范围修改，既有活跃变更与手工门禁未被擅自修改。

## 7. 真实桌面验收与证据

- [ ] 7.1 用 `pnpm tauri dev` 验证截图一的点击桌面/外部应用收起、Escape、连续 Ø 点击、迅速重开和 tray/工具/主/设置/关于交接；记录实际观测及焦点行为。
- [ ] 7.2 验证截图二的每个真实工具提示及 Ø，跨单元停留、收缩/展开、隐藏工具、状态刷新和左/右键；覆盖可用多显示器/缩放配置，不可用硬件保留待验证。
- [ ] 7.3 验证截图三/四的单行导航、溢出按钮/触控板、侧栏收缩/展开/重启恢复和标题去重；记录合成 1/5/20/50 项、中英文长名称、短/窄窗口、reduced motion 与各插件反馈。
- [ ] 7.4 从 tray 操作 File picker/取消/错误与已接受转换任务，必要时检查其他现有保存对话框；验证释放 modal guard、不抢焦点、外部点击仍收起，作业结果可重新查看。使用合成文件，不改变引擎审批。
- [ ] 7.5 在可用 Windows 设备验收单主图标 fallback、失焦/picker、导航与主侧栏；设备不可用时明确保留待验证，不用 macOS 或 cross-target build 代替。
- [x] 7.6 在本变更 evidence 记录规范、自动门禁、macOS 和 Windows 的独立证据与剩余限制；更新直接受影响的项目说明，确认无生成资产/私人数据、无提交推送发布归档，手工任务只根据真实证据勾选。

2026-10-09 原批次：实现与验证范围见 [验收记录](evidence/verification-2026-10-09.md)。未勾选项包含系统 hover、真实外部失焦/Ø 快速点击、触控板/缩放、已接受 File 作业和 Windows 设备验收；不能用浏览器或编译结果代替。

## 8. 主窗口内设置（本轮增量）

- [x] 8.1 将 main host 拆为 tools/preferences 视图，复用现有 SettingsCenter/controllers 并加入“设置”身份与“返回工具”；交互验证同一原生标题栏、无新窗口/遮罩，首次常规与会话目的地/搜索恢复。
- [x] 8.2 保持工具子树和输入/滚动上下文，按可见视图管理展示活动；测试切换前后选择、待选文件/查询、侧栏偏好、有效选择回退和已接受作业，验证隐藏工具无额外 UI 轮询。
- [x] 8.3 将兼容 show_preferences_window/typed invoke 重定向到 main 设置；在原生 host 保留最新目标并在 ready 后可靠交接，测试首次创建、现有 main、连续 tools/preferences 请求、失败反馈和 caller 边界。
- [x] 8.4 清理 preferences 独立窗口工厂/常驻路由及相关 capability/caller/lifecycle，必要旧入口仅重定向；source-contract 与 Rust/TS 契约检查通过，File engine 仍保留独立权限，关于与工具面不受影响。
- [ ] 8.5 回归分类、搜索定位、语言、自启动、状态栏、快捷键、工具可见/启用与 Extensions 保存/错误反馈；验收中英文、键盘、短/窄窗口与两个返回层级，确保旧设置能力可达。

## 9. macOS 单元背景高亮（本轮增量）

- [ ] 9.1 原生验证关闭自动整组 highlight 与局部绘制的公开 API 方案，覆盖 tray-icon mouseDown/mouseUp 和 menu tracking；证据证明工具按下无整组闪亮、Ø 可整组高亮且点击/tooltip 不变，不可行时记录阻塞及可审查适配方案。
- [x] 9.2 实现稳定 item id、当前单元几何与交互 generation 的高亮模型；测试工具/Ø、取消/失败、直接动作、旧 close 事件、collapse/隐藏/移除和布局刷新。
- [ ] 9.3 接入主线程原生背景绘制与按压/菜单/工具面生命周期，清理 observer/owner/资源；真实操作验证单元高亮、菜单退出/面失焦清除、Ø toggle、浅深色/缩放和现有 hover/右键/修饰键收缩，无新增原生项。
- [ ] 9.4 回归非 macOS 单图标 feedback 与直接动作 fallback；现有跨平台检查通过，并单独记录 Windows 设备证据，设备不可用保留待验证。

## 10. 增量集成验收（旧门禁记录不覆盖本轮增量）

- [x] 10.1 实施后重跑 pnpm test/build、Rust fmt/check/test、独立 build-graph、OpenSpec strict 与 diff gate；新增证据单独记录，不修改旧测试结果或据此勾选原生任务。
- [ ] 10.2 用 pnpm tauri dev 验收补充截图一/二的设置同窗口/返回、tray 首次打开与快速目标切换、工具上下文和 File 作业；逐工具验证按下/菜单/关闭的局部高亮及 Ø 整组反馈，记录 macOS 实测和未覆盖硬件范围。
- [x] 10.3 验收后更新项目窗口地图与本轮 evidence，明确源码/自动门禁/macOS/Windows 范围；保留未完成设备任务，未经请求不提交、推送或归档。

2026-10-09 补充实施及提交前复测：新增任务完成 7/12，整体 28/42；设置和高亮代码已接入，完整自动门禁复测通过；设置完整交互回归、系统栏视觉和 Windows 等门禁保留未勾选。详见[补充验收记录](evidence/verification-supplement-2026-10-09.md)。原 tasks 1–7 勾选不变。
