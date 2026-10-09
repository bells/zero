# 托盘与工作区导航验收 · 2026-10-09

范围：`refine-tray-and-workspace-navigation`。当前任务清单 21/30；未提交、推送、发布、同步主规范或归档。使用项目 OpenSpec apply、impeccable 产品/交互指导和 React 检查指导。

## 实现与契约

- 托盘由原生 host 注册一次 focus 事件；150ms 后重查可见性、焦点、展示 generation 和 dialog depth，再走 `hide_surface`。重新聚焦/Ø 开关使旧计时器失效；peer 工具面和 main/preferences/about 沿用窗口协调器。
- tray 原生 picker/save 使用作用域 guard。RAII lease 处理成功、取消、错误、worker unwind 和嵌套释放；退出后重查焦点，不强制抢焦点。隐藏 tray 没有调用 File 队列取消或 shutdown。
- Rust `hide_tray_quick_panel(window, app) -> Result<(), String>` 只允许 tray caller；前端为 `appWindows.hideTrayQuickPanel(): Promise<void>`。不扩大 capability 或 File engine 权限。
- macOS 保留一个组合状态栏项与 22pt 单元。名称沿用可见单元顺序；公开 AppKit tooltip rect callback owner 持有 NSString。刷新先移除 tag 再释放 owner；退出在主线程清理。真实 OS hover 是否正确仍待设备验收。
- `PluginNavigation` 共用品牌 glyph、File Lucide 图标与 extension fallback；44px 入口、52px tray 单行导航，水平滚动/边缘按钮、完整 aria 名称/健康描述、独立 selected/focus、portal 提示及名称变更刷新。
- main 侧栏为 192px/64px；`mainSidebarCollapsed` 走既有偏好存储，支持保存失败反馈和 storage 同步。800px 及以下自动紧凑，宽窗口恢复保存模式；原生 main 最小宽度 760px，原拟 720px 断点不可达。grid/sidebar 限制高度，长列表独立滚动。
- 工作区删除宿主重复标题和静态介绍徽章，保留 accessible name；File 删除 LOCAL / SESSION，保留唯一内容标题、格式/provider/队列/操作/隐私说明。通用、空、加载状态本地化。

## 自动门禁

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 最终 339/339 通过，0 skipped；包含边界、懒加载、偏好兼容、typed invoke、File 队列及溢出边界 |
| `pnpm build` | 最终 TypeScript/Vite 通过；既有 PDF.js 大块提示保留 |
| `cargo fmt --check` / `cargo check --locked` | 最终通过；Cargo.lock 未更改 |
| Rust 首轮沙箱全量 | lib 217 passed、1 failed、1 ignored；private pasteboard 不可用，保留首轮结果，未弱化测试 |
| Rust 沙箱外串行全量 | 最终 325 passed、0 failed、2 ignored，19 个 suite result；新增 RAII 测试覆盖返回结果、取消、错误和 worker unwind |
| build graph | budget 通过，无禁止的 eager import；入口 277,449 bytes / gzip 85,394 bytes，最大懒加载块 795,338 bytes。输出独立 `/tmp/zero-build-graph.json`，未覆写历史 evidence |
| OpenSpec / diff | 全部 strict 22/22、本变更 strict 和 `git diff --check` 通过；旧 `zero-icon-system` 归档依赖提示保留，旧 change 任务未改 |

最终临时日志：`/tmp/zero-navigation-final-{frontend-tests,build,cargo-check,rust-tests,openspec,build-graph}.log`；首轮 Rust 失败为 `/tmp/zero-navigation-rust-tests.log`。这些不是持久发布证据。新生成资源、fixture 和调试配置未纳入源码。

## 浏览器组件证据

Ignored 本地 fixture 直接引用真实导航、紧凑 hook 和 CSS，使用合成插件；它不是完整 Tauri App/File engine。

- 400×500，1/5/20/50 项：1/5 不溢出，20/50 显示左右按钮；只有一行，导航高 52px，入口宽 44px，底部动作可达。
- 英文 50 项：Space 选择末项并自动揭示，完整名称 tooltip 可见；scrollLeft 达最大 2100px 时 next disabled、previous enabled，反向按钮滚动不改变选中项。
- 中文 50 项短侧栏：修正前撑出窗口；修正后 viewport 高 414px、scrollHeight 2398px，末项 focus/selected 可见，toggle 保留顶部。
- 切换 64/192px 时，input 合成内容 `navigation-state-check` 和选中项保持。
- 920→760→920px：中文/英文均自动 64px，再恢复 192px；英文末项 focus、selected、完整 hint 保持。
- 源码存在 reduced-motion media rule，按钮按 media query 使用 instant；未修改系统设置，也未完成该模式下的实机手势验收。observer/storage/matchMedia/blur/keydown 均有 cleanup。

## macOS 原生证据与限制

`pnpm tauri dev` 首轮沙箱端口绑定失败，获准沙箱外启动成功。随后沿用项目 smoke 方法，以 ignored config 构建可见 main/tray debug `.app` 供 CUA 访问；真实窗口使用生产源代码和 dist。最终可见 tray 命令：

```sh
pnpm tauri build --debug --bundles app --config build/navigation-smoke/tray-native.config.json
```

这是可见调试启动证据，不能代替正常 tray-first 启动、签名安装包或 release。交互全部使用 CUA，没有 AppleScript、CGEvent 或 shell 截屏。

已观察：

- tray 五图标一行，内容独立滚动，底部偏好/打开 Zero/更多可达；File 的格式、provider、空队列可见。
- 更多打开后第一次 Escape 关闭菜单、tray 保留；无弹层时 Escape 后报告 `noWindowsAvailable`，确认托盘隐藏。
- tray File picker 打开后，Escape 只取消原生 dialog，返回同一 File 托盘，选中状态/空队列保持。
- “打开 Zero”交接到独立 main。侧栏收起/展开时当前 File 保持；重启 debug app 后新 main 恢复上次保存的收起模式。
- main File 只有一个可见 heading。临时预览 `/tmp/zero-navigation-main-preview.png` 不含文档内容或私人路径。
- File provider 保留既有“修复或重新安装”反馈；没有修改审批，也没有成功转换或已接受后台作业的实机证据。

未通过或无法判定：

- 点击计算器、Raise 和 Cmd+Tab 后，tray 仍在可观察树中。此轮无法确认接口是否转移真实系统焦点，不能认定外部失焦契约通过；真实鼠标点击外部窗口/桌面保留手工验收。
- SystemUIServer attach 失败，当前 API 不提供 pointer-hover；Ø/每工具跨单元停留、收缩/展开、隐藏工具后的真实 OS tooltip 保留待验收。
- 连续 Ø 点击、快速重开、全部工具/设置/关于交接、保存对话框、已接受 File 作业隐藏后继续、混合 DPI/多屏、真实触控板/reduced-motion 均未完成验收。
- 自动审批拒绝读取 Finder 完整无障碍树，因为包含桌面私人文件名；后续改用计算器，没有继续读取这些私人内容。这不等于失焦通过。

## Windows 与交付边界

无可用 Windows 设备，也无本轮 cross-target 编译证据。非 macOS fallback/direct-action 源码契约测试通过，不能代替单图标/picker/失焦/导航设备验证。Linux/mobile 支持未扩展。

剩余 9 项保留完整或部分设备门禁，未据编译/浏览器结果勾选。File 签名、审批、完整语料与发布测量保持原样。验证结束清理任务启动的 fixture server、临时 viewport 和测试 app；源码及证据保留供审阅。
