# Zero 项目全景与维护地图

核对日期：**2026-10-23**。本轮源码基线：`b3e9ebf6261c3424b57d55dad276a705114a09aa`。本页整理当前产品、源码边界与后续工作；下方引用的历史验收保留原日期。本次是文档与源码盘点，不是完整运行时审计或新一轮设备、安装包、线上部署验收。

## 产品与当前重点

Zero 是跨平台桌面工具箱，从状态栏 / 系统托盘快速使用独立可插拔的插件工具。桌面包含 Snap、Awake、Paper、Launch、File 五个模块，形成「快捷入口 + 主窗口工具/设置 + 独立关于 + 专用工具窗口/原生菜单」的结构。

2026 年 10 月官网已引入在线工具箱：八个中英文浏览器工具覆盖开发、图片、文本三类。官网既是产品入口，也能直接完成任务；它不依赖安装桌面端。可选反馈另有独立服务，工具计算不依赖该服务。

**下一阶段由维护者重新体验五个桌面工具，再逐个优化一版。** 以真实操作中的入口、交互、状态反馈和稳定性问题驱动小范围改动，保持紧凑托盘与完整主窗口的职责区别。官网继续维护已有工具、输出质量与设备边界；没有据此承诺新插件或跨端功能对齐。

## 阅读入口

| 目的 | 入口 |
| --- | --- |
| 中英文介绍、开发命令 | [README](../README.md) |
| 产品定位与设计原则 | [PRODUCT.md](../PRODUCT.md) |
| 协作规则、验证与边界 | [AGENTS.md](../AGENTS.md) |
| 快速恢复项目上下文 | [memory.md](../memory.md) |
| SDD 上下文与配置 | [openspec/project.md](../openspec/project.md)、[config.yaml](../openspec/config.yaml) |
| 官网开发、隐私、导出与设备矩阵 | [website.md](website.md) |
| 反馈运行、许可、审核与部署门禁 | [feedback/README.md](../feedback/README.md) |
| 插件协议与开发 | [Protocol v1 状态](plugins/protocol-v1.md)、[MVP 协议](plugins/mvp-plugin-protocol.md)、[开发指南](plugins/developer-guide.md) |
| 插件与桌面打包 | [插件发布](plugins/publishing-github-releases.md)、[桌面打包](packaging.md) |
| File 引擎与诊断 | [离线引擎](plugins/zero-file-offline-engines.md)、[诊断指南](diagnostics.md) |
| 图标与截图编辑器 | [图标系统](icon-system.md)、[截图编辑器地图](../src/plugins/screenshot/capture/README.md) |

## 三个工程的职责

| 工程 | 技术与依赖 | 边界与主要入口 |
| --- | --- | --- |
| 桌面根工程 | React 19、TypeScript 5.8、Vite 7；Tauri 2、Rust 2021 | `src/`、`src-tauri/`；根 `package.json` / `pnpm-lock.yaml` |
| 官网 `website/` | Astro 7、TypeScript 5.9、浏览器 Worker；独立依赖/锁文件 | `src/content/` 双语内容，`src/components/webTools/` 页面，`src/lib/web-tools/` 规则，`src/scripts/web-tools/` 交互与 Worker |
| 反馈 `feedback/` | Node 24、Hono、固定 Waline 集成、PostgreSQL；本地合成测试用 PGlite | `shared/contracts.ts`、`server/app.ts`、`server/waline.ts`；独立依赖/锁文件与 GPL-2.0-only 许可 |

根工程构建/测试不覆盖官网或反馈。官网不导入桌面 React/Tauri IPC 或 File 引擎；反馈服务及数据库代码不进入官网或桌面 bundle。三者分别构建、验证和交付。

## 桌面架构与责任

```text
Tauri 窗口 label → src/main.tsx 懒加载路由 → 宿主界面 / 插件 surface
  → plugin hook + typed service / host Extension Bridge
  → Rust commands（IPC、调用者、参数边界）
  → Rust services（系统能力、权威状态、资源与生命周期）
```

- **组合层**：`src/appShell/bundledPluginModules.ts` 通过 `bundledPluginCatalog.*.ts` 选择工具集；Vite 按构建 profile 解析 catalog。`src-tauri/src/bundled_plugins.rs` 组合原生状态、lifecycle、诊断；`lib.rs` 注册 commands 与协议，Rust feature gates 对应裁剪。
- **宿主核心**：`src/core/pluginHost/` 管理注册表、市场、扩展 UI 与 Bridge；`preferences/` 管理全局设置/语言/持久化；`windowing/` 管理活动状态。共享窗口、状态栏、快捷键、导航和 OCR 在宿主服务协调。
- **插件内部**：每个模块自有 `plugin.tsx`、manifest、翻译、UI、hook/service、domain/contracts。core 不导入具体插件，插件不互相导入；相关测试约束模块边界。
- **原生服务**：`commands/` 保持薄层；Rust 管理系统调用、文件、进程、权限、队列、超时与取消。React 管理 UI 与交互；昂贵工作不能阻塞 UI/async 线程。
- **File 计算例外**：独立 WebView 运行 PDF.js/docx/docx-preview 引擎。Rust 仍控制输入暂存、输出验证、lease、队列、取消和资源限额。
- **第三方边界**：`src-tauri/src/plugins/` 管理包校验、registry、权限、签名/摘要和运行时。内置模块随宿主编译，第三方不能动态加载 Rust。公开 Web API v1 的 `PUBLIC_WEB_RUNTIME_ENABLED` 仍为 false；macOS debug 的 `ZERO_PLUGIN_WEB_DEV=1` 只是开发覆盖。legacy process runtime 与隔离 WebView 不是同一种安全模型。

full 源码配置含五工具，standard 含 Snap/Awake/Paper/Launch，core 无内置工具。现有试用打包只提供 core/standard，均排除 File。“五个源码模块”与“四工具试用包”并不矛盾。

## 窗口与五插件地图

| label / surface | 当前用途 |
| --- | --- |
| `tray` | 默认隐藏的 400 × 500 快捷面板；`tauri.conf.json` |
| `main` | 920 × 660（最小 760 × 520）工具/设置；`show_preferences_window` 转向主窗口设置视图，返回保留已访问工具上下文 |
| `about` | 500 × 560（最小 420 × 360）独立关于与诊断入口 |
| `launcher` / `paper` | Launch 浮窗 / Paper 专用窗口 |
| `capture` / `pin-*` | macOS 截图编辑 / 钉图 |
| `zero-file-engine` | 隐藏转换引擎，仅使用独立 `capabilities/file-engine.json` |

Snap/Awake 快捷动作使用原生菜单；`snap-menu` WebView 已移除，设置也没有独立窗口。`src/appShell/appSurface.ts` 负责普通路由；未知 label 回退 tray，File label 在 `main.tsx` 单独处理。窗口改动必须同时检查路由、capability、调用者、焦点和清理；不得将 File 引擎加入默认 capability。

| 插件 | 源码位置 | 当前实现与限制 |
| --- | --- | --- |
| Snap `zero.snap` | `src/plugins/screenshot/`、`services/screenshot.rs`、`services/screenshot/` | macOS 窗口候选、选区平移/尺寸/圆角、六工具属性、对象编辑、撤销重做、复制/保存/钉图、Vision OCR；Windows 仅系统截图启动器；Linux 不支持截图 |
| Awake `zero.awake` | `src/plugins/caffeine/`、`services/caffeine.rs` | 时长、状态与原生动作；macOS `caffeinate -d -i`、Windows `SetThreadExecutionState`，其他平台不支持 |
| Paper `zero.paper` | `src/plugins/bingWallpaper/`、`services/bing_wallpaper/` | 最多 10 条 Bing 壁纸缓存、旧快照优先、下载与应用；Linux 应用取决于可用桌面后端，未形成完整设备支持声明 |
| Launch `zero.launch` | `src/plugins/quickLauncher/`、`services/quick_launcher/` | 中英文/拼音模糊搜索、应用启动/聚焦、系统设置；索引 macOS 应用包与 Windows 开始菜单；Linux/mobile 不支持 |
| File `zero.file` | `src/plugins/file/`、`services/file/`、`plugins/engine_assets.rs` | 内置 PDF→DOCX 有 macOS/Windows 路径，扫描页 OCR 仅 macOS；内置 DOCX→PDF 仅 macOS 11+；可选 LibreOffice/Word provider 独立存在 |

Snap 默认 `CommandOrControl+Shift+A`；Launch 默认 macOS `Alt+Space`（Option）、Windows `Control+Alt+Space`。打包 release 启动后创建所含工具的系统搜索入口，转发到同一 Zero 实例；物理快捷键、实际搜索索引与 Windows 行为仍按设备验收。

搜索入口位于 macOS `~/Applications/Zero Tools/` 或当前用户 Windows `Start Menu/Programs/Zero Tools/`。Alfred、Spotlight、Raycast、Windows Search 的索引范围和时机由各工具决定；移动 Zero 后重新打开一次以更新路径。普通开发启动不安装持久入口，macOS 打包 debug 可通过 `ZERO_DESKTOP_ENTRIES_TEST_ROOT` 使用隔离测试目录。入口是转发包装，不是独立签名分发包；隐藏/禁用工具不会自动启用。卸载后仅移除 Zero 自己拥有的入口目录，勿清理其他应用。

## 官网在线工具箱

中文 `/tools/`，英文 `/en/tools/`；`website/src/content/web-tools.ts` 定义八个 slug 和分类，`web-tool-guides.ts` / `markdown-content.ts` 提供共享双语说明。五个桌面工具说明页仍保留，不属于八个可执行在线工具的计数。

| 分类 | slug | 能力 |
| --- | --- | --- |
| 开发 | `timestamp` | 单条/批量 Unix 时间、北京时间、UTC 与完整 JSON 导出 |
| 开发 | `json` | 严格 JSON 校验、格式化、压缩与错误定位，保留大整数/重复键原文 |
| 开发 | `base64` | Unicode 文本、URL 组件与本地图片编解码 |
| 开发 | `diff` | UTF-8 文本/文件对比、行级/行内高亮、并排/统一与差异导航 |
| 图片 | `image-converter` | HEIC/HEIF 主静态图、JPEG/PNG/静态 WebP 转 JPEG/PNG/WebP |
| 图片 | `image-watermark` | 批量九宫格单处或平铺文字水印 |
| 图片 | `image-compressor` | JPEG/WebP 质量压缩、PNG 无损优化、真实体积与成功项 ZIP |
| 文本 | `markdown` | 源码/预览/分屏、增强编辑、目录、Markdown/独立 HTML/文字型中文 PDF 下载、独立打印 |

纯 TS 规则与 DOM/Worker adapter 分离；重任务可终止，revision 防止旧结果回写，清空/离页释放资源。分类内搜索与全工具搜索独立，查询不写 URL/存储。当前生成规则覆盖 36 个可索引页面，另有两个 noindex 错误页；canonical/hreflang、sitemap、llms 索引随共享内容生成，部署和实际收录另行确认。

**隐私语义：**计算输入和结果留在浏览器；首页/算法/字体/codec 加载仍使用网络。Markdown 草稿默认关闭，只可主动保存一篇本机草稿；外部图片默认不请求，明确授权后由浏览器请求来源，无服务端代理。反馈只传稳定线程/locale 上下文，不附送工具输入、文件名、正文或结果。

图片当前策略为单图 16 MiB / 12,200,000 像素、每批最多 10 张；48MP 拒绝，完整手机资源策略尚待实测。输出会清理源元数据，但“保留原图”保留原始字节；不承诺 HDR/Live Photo/原色域保真。Markdown PDF 是文字型导出，有字体/字符覆盖和资源限制，不能当作网页像素复刻。精确限额以 policy 源码及[官网指南](website.md)为准。

## 反馈服务

`feedback/shared/contracts.ts` 当前允许 **9 个稳定线程**（目录 + 八工具），中英共享。匿名纯文本先审后公开，仅站长回复；`server/app.ts` 提供受控接口，固定 Waline core 复用审核/认证等能力，PostgreSQL 管理事务与限流。官网仅主动点击后创建异源 iframe；默认不启用。

按固定上游发布材料保守采用 GPL-2.0-only，保留源码/锁文件/许可说明；其许可范围不改写桌面和官网。生产部署、账号费用/资格、日志备份保留、周期清理、多实例验证与 Safari iframe 验收保持独立门禁，详情见[服务说明](../feedback/README.md)。

## IPC、数据与兼容性

- 截图媒体使用 raw IPC 与不透明 token；导出先 `prepare_screenshot_commit` 取得一次性 lease，再由 `upload_screenshot_commit` 接收 PNG raw body。新 session/media/lease 常用 camelCase，旧响应仍可能 snake_case，逐项匹配 Rust serde 与 TS interface。
- `CaptureDisplaySnapshot` 绑定同屏逻辑/物理 frame、源像素和比例；共享 `services/ocr/` 接收受控 PNG。Snap 限 active session/crop，File 限 engine run/page/version/lease，两插件不互相调用。
- Launch 仅接收宿主索引生成的 `itemId`，不开放任意命令/路径/URI；原始查询不持久化。Paper 的网络和缓存归 Rust 管理，失败保留可用旧快照，不删除未知文件。
- 包安装：`~/.zero/plugins/<plugin>/<version>/`；Paper：`~/.zero/data/wallpaper/`；Launch：`~/.zero/data/quick-launcher/`；File 暂存：Tauri app cache 下的 `file-conversion`。
- 保留 `com.watson.ztool`、`~/.zero`、`zero.preferences.v1`。旧 `~/.ztool` / `ztool.preferences.v1` 为迁移输入，保留原数据且当前数据优先；四个历史 ID 映射不含新加入的 File。
- 本地诊断使用安全字段和受控导出；不得写入 OCR 正文、私有路径内容、工具输入或凭据。启动异常先看结构化 `code`、`phase`、`outcome` 和权限上下文。

## File 与公开插件发布边界

`src-tauri/file-engine-policy.json`：`approvedEnginePackages` 为空；候选 **1.2.0**、协议 **2**、`approved: false`、`packageSha256: null`。完整语料、打包 smoke、发布测量、Windows runtime 标志仍未通过。PDF→DOCX 以可编辑正文为目标，不能用整页截图伪装可编辑结果；普通图片/原版式保真不作承诺。

`ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev` 仅允许 debug 源码回退。predev/prebuild 准备资源不等于安装可信签名包。遇到修复/重装提示，依次查 provider diagnostic、已装身份/版本、policy/签名/资产、隐藏 WebView readiness；不能以放宽 policy 消除报错。

公开插件协议的 network provider、声明式命令激活、完整更新事务及设备 conformance 仍有未完成项。校验 manifest、macOS debug SDK 流程或旧 MVP 包管理存在，均不代表公开 Web runtime 已发布。

## 工程、CI 与验证

桌面 package/Cargo/Tauri 版本均 **0.1.0**，pnpm **10.33.0**。统一推荐 Node **24+**（website/feedback 要求）；桌面依赖也兼容 Node 22.13+ 的 22.x。本次读取到 Node 24.20.0、OpenSpec 1.12.0。

- `.github/workflows/ci.yml`：macOS/Windows 桌面编译与 Rust 测试，完整前端测试仅 macOS；Windows 另含 File engine 路径与 packaging source-contract 检查。没有 Linux/mobile 桌面 CI。
- `website-check.yml`：Ubuntu + Node 24，独立依赖、codec 准备、内容/类型/单元/构建/SEO/Chromium 检查。它不是 Linux 桌面支持证明；也不等同于 feedback 服务全套检查。
- `release.yml`：当前名称为 **Package Zero**。core/standard × Apple Silicon/Intel macOS/Windows 产物，手动触发生成 Actions artifacts，版本 tag 附到 Draft Release。配置存在不证明最新远程运行成功。
- 常用命令见 [AGENTS.md](../AGENTS.md)。测试准备会替换 `/private/tmp/zero-tests`，共享 fixture 与 `public/file-engine/` 构建不要并发；bundle 检查指定 `--output /tmp/zero-build-graph.json`，避免覆盖历史证据。

本轮文档验证：136 个本地链接目标存在；中英文 README 命令一致，五插件列表、版本、File policy、公开 runtime 开关、八工具/九线程和 32 行 OpenSpec 任务快照与源码一致；`openspec validate --all --strict` 为 34 passed / 0 failed，`git diff --check` 通过。未重跑桌面、官网、反馈完整回归。历史测试数量不再作为“当前通过”的固定事实写入长期记忆。

## 历史证据与未闭合事项

| 范围 | 已有记录 | 仍需独立验证 |
| --- | --- | --- |
| Snap 标注与紧凑属性 | [标注实施](../openspec/changes/enhance-snap-annotation-editing/evidence/implementation.md)：浏览器/Canvas 验证，记录维护者正常 `pnpm tauri dev` 体验确认 | 多屏/混合 DPI、原生颜色/IME、完整 Copy/Save/Pin、持久化与设备专项；临时 `.app` 权限失败不能覆盖正常开发启动结论 |
| Snap / File 共享 OCR | [OCR 记录](../openspec/changes/enhance-snap-and-share-offline-ocr/evidence/verification.md) | 完整 Snap 原生流程、Windows 能力、签名引擎；TextEdit 编辑通过不证明版式保真 |
| 导航、设置与状态栏 | [导航](../openspec/changes/refine-tray-and-workspace-navigation/evidence/verification-2026-10-09.md)、[设置补充](../openspec/changes/refine-tray-and-workspace-navigation/evidence/verification-supplement-2026-10-09.md) | 外部失焦、tooltip/高亮、跨屏与 Windows 设备矩阵 |
| Launch 与系统入口 | [入口记录](../openspec/changes/refine-launch-and-system-search/evidence/verification-2026-10-11.md) | 物理快捷键、系统搜索实际索引、Windows 设备 |
| 插件 SDK 与隔离 | [conformance](../openspec/changes/standardize-zero-plugin-protocol/evidence/conformance-2026-10-07.md)、[macOS UI](../openspec/changes/standardize-zero-plugin-protocol/evidence/macos-ui-2026-10-07.md) | 审批/更新/恢复完整事务、Windows WebView2、正式打包与 runtime 开放 |
| 官网 Markdown | [实施](../openspec/changes/add-web-markdown-editor/evidence/implementation.md)、[桌面 Safari](../openspec/changes/add-web-markdown-editor/evidence/safari-desktop.md)：2026-10-23 记录 Chrome 回归与真实 Safari 27.0.1 代表性流程 | 真实 iPhone、线上部署与收录；桌面 Safari 证据不覆盖所有图片工具或反馈 iframe |
| 官网图片 | [图片实施](../openspec/changes/add-web-image-tools-and-categories/evidence/implementation-2026-10-18.md)、[设备矩阵](../openspec/changes/add-web-image-tools-and-categories/evidence/device-matrix.md) | 原始相机 HEIC、手机峰值/回收、完整 Safari 下载与最终资源策略；合成 12MP 实验是局部证据 |
| 反馈 | [本地实施](../openspec/changes/add-web-tools-feedback/evidence/implementation.md) | 托管部署、清理/保留期限、实际多实例与 Safari |
| 性能与发行 | [性能变更](../openspec/changes/systematic-performance-and-code-optimization/tasks.md)、[试用打包](../openspec/changes/package-zero-trial-profiles/tasks.md) | 同环境延迟/RSS/资源回落、签名安装包与设备测量 |

## OpenSpec 当前快照

2026-10-23 按 `openspec/changes/*/tasks.md` 文本统计：**32 个活跃变更，158 项未勾选任务**；主规范仍为 `main-window-shell`、`caffeine-duration` 两项。数量是任务账本，不是产品完成度或缺陷数。已实现能力大量保留在未归档 delta 中；本轮不更改任务勾选、同步或归档。

| 变更 | 已勾选 / 总任务 |
| --- | --- |
| [add-bing-wallpaper-plugin](../openspec/changes/add-bing-wallpaper-plugin/tasks.md) | 47 / 47 |
| [add-file-plugin](../openspec/changes/add-file-plugin/tasks.md) | 39 / 42 |
| [add-plugin-extension-api](../openspec/changes/add-plugin-extension-api/tasks.md) | 51 / 52 |
| [add-quick-launcher-plugin](../openspec/changes/add-quick-launcher-plugin/tasks.md) | 56 / 71 |
| [add-web-image-tools-and-categories](../openspec/changes/add-web-image-tools-and-categories/tasks.md) | 36 / 40 |
| [add-web-markdown-editor](../openspec/changes/add-web-markdown-editor/tasks.md) | 36 / 37 |
| [add-web-tools-feedback](../openspec/changes/add-web-tools-feedback/tasks.md) | 23 / 28 |
| [add-zero-product-website](../openspec/changes/add-zero-product-website/tasks.md) | 25 / 25 |
| [bundle-zero-file-offline-engines](../openspec/changes/bundle-zero-file-offline-engines/tasks.md) | 49 / 56 |
| [compact-and-collapse-status-bar-items](../openspec/changes/compact-and-collapse-status-bar-items/tasks.md) | 27 / 28 |
| [design-zero-icon-system](../openspec/changes/design-zero-icon-system/tasks.md) | 25 / 26 |
| [enhance-snap-and-share-offline-ocr](../openspec/changes/enhance-snap-and-share-offline-ocr/tasks.md) | 19 / 34 |
| [enhance-snap-annotation-editing](../openspec/changes/enhance-snap-annotation-editing/tasks.md) | 36 / 42 |
| [enhance-zero-snap-smart-selection](../openspec/changes/enhance-zero-snap-smart-selection/tasks.md) | 44 / 50 |
| [extend-web-tools-batch-and-diff](../openspec/changes/extend-web-tools-batch-and-diff/tasks.md) | 28 / 28 |
| [improve-about-and-add-diagnostics](../openspec/changes/improve-about-and-add-diagnostics/tasks.md) | 31 / 35 |
| [open-tool-surfaces-from-status-bar](../openspec/changes/open-tool-surfaces-from-status-bar/tasks.md) | 17 / 23 |
| [optimize-preferences-settings](../openspec/changes/optimize-preferences-settings/tasks.md) | 41 / 41 |
| [optimize-screenshot-toolbar](../openspec/changes/optimize-screenshot-toolbar/tasks.md) | 21 / 22 |
| [optimize-status-bar](../openspec/changes/optimize-status-bar/tasks.md) | 30 / 31 |
| [optimize-zero-snap](../openspec/changes/optimize-zero-snap/tasks.md) | 30 / 34 |
| [package-zero-trial-profiles](../openspec/changes/package-zero-trial-profiles/tasks.md) | 7 / 10 |
| [refine-awake-controls-and-status-menu](../openspec/changes/refine-awake-controls-and-status-menu/tasks.md) | 14 / 21 |
| [refine-launch-and-system-search](../openspec/changes/refine-launch-and-system-search/tasks.md) | 6 / 9 |
| [refine-tray-and-workspace-navigation](../openspec/changes/refine-tray-and-workspace-navigation/tasks.md) | 28 / 42 |
| [refine-zero-file-editable-conversion](../openspec/changes/refine-zero-file-editable-conversion/tasks.md) | 15 / 20 |
| [refine-zero-icon-family](../openspec/changes/refine-zero-icon-family/tasks.md) | 34 / 34 |
| [rename-ztool-to-zero](../openspec/changes/rename-ztool-to-zero/tasks.md) | 33 / 36 |
| [reorganize-project-modules](../openspec/changes/reorganize-project-modules/tasks.md) | 33 / 34 |
| [standardize-zero-plugin-protocol](../openspec/changes/standardize-zero-plugin-protocol/tasks.md) | 14 / 36 |
| [systematic-performance-and-code-optimization](../openspec/changes/systematic-performance-and-code-optimization/tasks.md) | 55 / 74 |
| [usezero-web-tools-extension](../openspec/changes/usezero-web-tools-extension/tasks.md) | 23 / 23 |

`refine-zero-icon-family` 的 `zero-icon-system` 主规范依赖仍需在未来同步/归档时按顺序处理。严格校验通过不代表所有变更可归档。历史方案与 evidence 可追溯，但当前判断以源码、最新任务与具体验收范围为准。
