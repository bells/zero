# Zero 项目全景与维护地图

核对日期：2026-09-25。源码基线：`3120f5d3162440a69f561ea114db8ea9697921df`。本次是在该基线上的文档校准和一处测试模块排序修正，不是版本发布或完整安全审计。下列检查属于本机 macOS；未重新运行 Windows/Linux 设备测试、安装包测试或交互式截图流程。

## 当前结论

Zero 已形成「托盘快速入口 + 独立主窗口 + 独立设置/关于 + 插件工具窗口」的桌面工具箱，包含 Snap、Awake、Paper、Launch、File 五个内置插件。主要模块边界已有自动测试约束；功能完成度不能只看插件目录、manifest 平台列表或任务勾选。

当前 `package.json`、`src-tauri/Cargo.toml` 和 `tauri.conf.json` 均为 **0.1.0**。Zero File 的离线实现已存在，但签名包仍是未批准候选；性能和多显示器交互也保留未完成的实机门禁。旧文档中的“四个插件”“main 就是托盘”“截图通过 Base64 JSON 提交”等描述已不适用。

## 阅读入口

| 目的 | 入口 |
| --- | --- |
| 安装、启动、基本命令 | [README](../README.md) |
| 协作规则、代码边界、验证要求 | [AGENTS.md](../AGENTS.md)；旧 `.AGENTS.md` 仅保留指针 |
| 产品目标和设计原则 | [PRODUCT.md](../PRODUCT.md) |
| 快速恢复项目上下文 | [memory.md](../memory.md) |
| SDD 提案与变更上下文 | [openspec/project.md](../openspec/project.md)、[config.yaml](../openspec/config.yaml) |
| 插件协议、开发、发布 | [MVP 协议](plugins/mvp-plugin-protocol.md)、[开发指南](plugins/developer-guide.md)、[发布指南](plugins/publishing-github-releases.md) |
| File 引擎开发与发布边界 | [离线引擎指南](plugins/zero-file-offline-engines.md) |
| 图标源和生成规则 | [图标系统](icon-system.md) |

`docs/superpowers/` 和变更内的历史 evidence 保留原始时间上下文；不要把过去的测试数量、性能数据或产品命名直接当作当前事实。

## 架构与责任

```text
Tauri 窗口 label
  → src/main.tsx 懒加载路由
  → App.tsx 宿主界面 / 插件专属 surface
  → plugin hook + typed service / host Extension Bridge
  → Rust commands（IPC、调用者、参数边界）
  → Rust services（系统能力、状态、队列、资源生命周期）
```

- **组合层**：`src/appShell/bundledPluginModules.ts` 汇总五个插件 descriptor；`src-tauri/src/bundled_plugins.rs` 管理原生状态组合；`lib.rs` 注册 command、协议和运行时入口。
- **宿主核心**：`src/core/pluginHost/` 管理协议、市场、扩展 UI 和桥接；`preferences/` 管理全局设置、持久化和宿主翻译；`windowing/` 管理可见性/活动状态。
- **插件内部**：`plugin.tsx` + manifest + i18n + UI + hook/service + domain/contracts。宿主 core 不反向依赖具体插件，插件不互相导入；边界由 TS/Rust source-contract 测试约束。
- **原生服务**：`commands/` 尽量保持薄层；`services/` 承接截图、唤醒、壁纸、启动器、文件转换及窗口/快捷键/状态栏协调。
- **安装包宿主**：`src-tauri/src/plugins/` 负责包校验、签名/摘要、registry、权限、运行时和文件资产协议。第三方不能动态加载 Rust；文档中的“插件”需区分内置编译模块与运行时安装包。
- **受控 WebView 计算**：File 的 PDF.js/docx/docx-preview 属于引擎，不只是 UI。Rust 保持对原文件、输出路径、队列、取消和资源限制的控制。

## 窗口与功能地图

| label | 用途与入口 |
| --- | --- |
| `tray` | 默认隐藏的 400 × 500 快捷面板；`tauri.conf.json` |
| `main` | 920 × 660 工具主窗口；`commands/app.rs` |
| `preferences` / `about` | 设置中心 840 × 640 / 关于 460 × 420；独立于工具内容 |
| `launcher` | Launch 快捷键/状态栏入口，共享索引与查询 UI |
| `paper` | Paper 专属窗口 |
| `snap-menu` | Snap 状态栏截图入口 |
| `capture` / `pin-*` | macOS 截图编辑 / 钉图 |
| `zero-file-engine` | 隐藏的文件转换引擎，使用独立 capability 和调用者限制 |

默认 capability 覆盖上述宿主/工具窗口，**不包含** File 引擎；引擎使用 `capabilities/file-engine.json`。前端未知 label 回退托盘，File label 在 `main.tsx` 中单独处理。改变窗口时需同时检查路由、capability、原生调用者约束、焦点/失焦和销毁逻辑。

| 工具 | 主要源码 | 当前实现与平台边界 |
| --- | --- | --- |
| Snap (`zero.snap`) | `src/plugins/screenshot/`、`services/screenshot.rs`、`services/screenshot/capture_targets.rs` | macOS 自定义选区、窗口候选、尺寸/圆角、标注、复制/保存/钉图；Windows 系统截图启动器；Linux 截图不支持 |
| Awake (`zero.awake`) | `src/plugins/caffeine/`、`services/caffeine.rs` | 时长/状态；macOS `caffeinate -d -i`，Windows `SetThreadExecutionState`；其他平台返回不支持 |
| Paper (`zero.paper`) | `src/plugins/bingWallpaper/`、`services/bing_wallpaper/` | Bing 元数据、最多 10 条缓存、下载/应用；Linux 应用依赖桌面后端，不等于已有设备验证 |
| Launch (`zero.launch`) | `src/plugins/quickLauncher/`、`services/quick_launcher/` | 中英文/拼音模糊搜索、图标、成功使用记录、启动/聚焦/系统设置；macOS 应用包、Windows Start Menu；Linux/mobile 不支持 |
| File (`zero.file`) | `src/plugins/file/`、`services/file/`、`plugins/engine_assets.rs` | PDF→DOCX 内置 macOS/Windows 路径；DOCX→PDF 内置 macOS 11+ 路径；Windows 后者无内置 exporter，可选外部兼容 provider 独立存在 |

默认快捷键为 Snap `CommandOrControl+Shift+A` 和 Launch `CommandOrControl+Shift+Space`；全局快捷键与工具可见性在设置中管理。manifest 的平台声明可能比实际原生能力宽，应查询真实 capability/provider 状态。

## IPC、数据与兼容性

- 截图当前使用 `CaptureSessionPayload.media` 与短期 token 读取 raw bytes。导出先调用 `prepare_screenshot_commit` 取得一次性 lease，再通过 `upload_screenshot_commit` 提交 PNG raw body，并携带 lease/session/action headers；Rust 决定保存路径并校验会话、窗口、尺寸和有效期。
- 新截图 session/media/lease 结构使用 `serde(rename_all = "camelCase")`；旧 capability/start response 仍有 snake_case。TS 接口和 invoke 必须逐项匹配，不能统一替换命名。
- 启动器接收宿主索引生成的 `itemId`，不开放任意路径、命令行、Bundle ID 或 URI 执行；原始搜索词不持久化或上传。
- 壁纸由 Rust 限定网络目标、图片和插件目录，WebView 不获得任意文件访问；缓存失败应保留可用旧快照。
- 安装包路径为 `~/.zero/plugins/<plugin>/<version>/`；Paper 为 `~/.zero/data/wallpaper/`；Launch 为 `~/.zero/data/quick-launcher/`。File 临时转换数据在 Tauri app cache 的 `file-conversion` 下，不能与插件安装目录混为一谈。
- 偏好键为 `zero.preferences.v1`，兼容读取 `ztool.preferences.v1`。旧 `~/.ztool` 迁移不删除原数据，规范路径已有数据优先。
- `com.watson.ztool` 是升级兼容标识，不能为了品牌一致性随意改名。四个历史插件 ID 映射与当前五个内置插件并不矛盾，File 没有旧 ID 映射。

## Zero File 的关键状态

`file-engine-policy.json` 的 `approvedEnginePackages` 为空；候选 `1.0.0` 的 `approved` 为 false，`packageSha256` 为 null，完整语料、打包 smoke、发布测量和 Windows runtime 标志均未通过。源码里 provider 的启用常量不能代替这套包审批。

开发命令 `ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev` 仅在 debug 构建中允许源码引擎 fallback。普通 `pnpm dev/build` 准备资源，不等于安装/批准签名包。正式包仍必须经过签名、摘要、安装资产和版本租约校验。

“请修复或重新安装 Zero File 插件”应从 capability/provider diagnostic、已装版本、策略完整性、隐藏窗口 URL 与 readiness 逐层诊断。本次发现的默认策略与开发开关只构成排查依据；没有重现此前用户会话，不能宣称修好了那次报错。

## 工程与发布

当前环境为 Node 24.20.0、pnpm 10.33.0、Rust/Cargo 1.95.0、OpenSpec 1.12.0。锁定的 Vite 7.3.2 需要 Node `^20.19.0 || >=22.12.0`，PDF.js 6.2.108 需要 `>=22.13.0 || >=24`；README 原来的 Node 18+ 已不适用。CI 配置使用 Node 22。

CI 覆盖 macOS/Windows 编译和 Rust 测试，完整前端测试只在 macOS 运行；Windows 有 File engine 构建与 packaging source-contract 检查。当前没有 Linux/mobile CI，CI 也没有覆盖所有本地门禁（如 Clippy、完整 OpenSpec 校验与 bundle budget）。

Release 工作流配置 Apple Silicon、Intel macOS、Windows，创建 Draft Release。工作流标题、正文及手动触发 tag 模板仍含 ZTool；这是待处理的发布文案/约定，不能误改 bundle identifier。本次不触发构建发布，不改变 tag 和签名策略。

## OpenSpec 状态快照

现有主规范只有 `main-window-shell` 与 `caffeine-duration`，其余大量已实现能力仍在未归档 change deltas 中。共 17 个活跃目录、69 项未勾选任务；以下为文本计数，不是完成度认证。

| 变更 | 已勾选/总任务 |
| --- | --- |
| `add-bing-wallpaper-plugin` | 47/47 |
| `add-file-plugin` | 39/42 |
| `add-plugin-extension-api` | 51/52 |
| `add-quick-launcher-plugin` | 56/71 |
| `bundle-zero-file-offline-engines` | 49/56 |
| `compact-and-collapse-status-bar-items` | 27/28 |
| `design-zero-icon-system` | 25/26 |
| `enhance-zero-snap-smart-selection` | 44/50 |
| `open-tool-surfaces-from-status-bar` | 17/23 |
| `optimize-preferences-settings` | 41/41 |
| `optimize-screenshot-toolbar` | 21/22 |
| `optimize-status-bar` | 30/31 |
| `optimize-zero-snap` | 30/34 |
| `refine-zero-icon-family` | 34/34 |
| `rename-ztool-to-zero` | 33/36 |
| `reorganize-project-modules` | 33/34 |
| `systematic-performance-and-code-optimization` | 55/74 |

本次修正 `rename-ztool-to-zero` 三个场景标题：保留基线场景标识，正文使用 Zero 品牌，避免 MODIFIED requirement 被判定为丢失旧场景。主规范和归档状态保持原样。

严格校验通过后仍有提示：`refine-zero-icon-family` 修改的 `zero-icon-system` 尚不存在于主规范，需在未来获准同步/归档时按依赖顺序处理。不能将 19/19 校验通过理解为所有变更可立即归档。

## 本次验证证据

| 检查 | 结果与限制 |
| --- | --- |
| `pnpm test` | 251/251 通过；含纯逻辑、集成与源码契约，不是完整 GUI 自动化 |
| `pnpm build` | TypeScript + Vite 生产构建通过；PDF 懒加载大块仍触发 500 kB 提示 |
| bundle budget | 通过，入口静态 JS 269,252 bytes / gzip 82,646 bytes；最大懒加载块 795,338 bytes；无禁止的 eager imports |
| `cargo fmt --check` / `cargo check --locked` | 通过 |
| `cargo test --locked` | 沙箱首轮 181 通过、2 失败（private pasteboard 不可用、1 秒子进程超时）；获准沙箱外串行完整复测 269 通过、0 失败、1 ignored |
| Clippy `--all-targets --all-features -- -D warnings` | 首轮发现 `commands/screenshot.rs` 测试模块后仍有普通函数；仅移动测试模块至末尾后复查通过，受影响的调用者约束测试通过，前端 251 项复测通过 |
| `pnpm file-engine:build` + packaging verifier | 构建和策略检查通过；候选仍未批准，没有签名/安装包实机证明 |
| 插件示例校验、`pnpm icons:validate` | 通过 |
| `openspec validate --all --strict` | 修正场景标识后 19/19 通过；保留上述归档依赖提示 |
| 实机/发布/性能 | 未运行交互式 UI、多显示器、Windows 设备、完整引擎语料、签名安装包或 release 搜索基准；不能更新这些任务为完成 |

复现命令见 `AGENTS.md`。bundle 脚本默认会覆写历史 evidence，本次生成后已恢复该历史文件；后续建议指定 `--output /tmp/zero-build-graph.json`。编译/测试临时结果不纳入源码提交。

## 后续工作顺序

1. **发布前先闭合 File 包门禁**：批准摘要前完成语料、冷启动/内存/取消、干净 profile 离线安装和打包实机验证；如果当前目标是本地错误，先复现并读取诊断，避免直接修改审批策略。
2. **完成桌面交互证据**：Snap 单显示器捕获边界、Retina/负坐标/跨屏、复制/保存/钉图与首帧；状态栏 glyph 点击和瞬态窗口协调；Windows 原生路径单独验证。
3. **整理规范与发布差异**：依据实际证据推进活跃 change，按依赖同步主规范；另行处理 Release 的旧品牌文案与 CI 门禁覆盖。
4. **按热点维护代码**：当前前端 112 个 TS/TSX/CSS 文件约 18,785 行、Rust 源码 65 个文件约 25,184 行（含内嵌测试）。较大模块为 `App.css`（3,949 行）、`CaptureApp.tsx`（1,309 行）、`services/screenshot.rs`（2,027 行）、`status_bar.rs`（1,428 行）、Paper 服务（1,383 行）、File bridge（1,354 行）。这些是维护热点，不是性能瓶颈证明；后续按职责和实测拆分，不做全局重写。
5. **补齐性能测量**：bundle budget 已有自动证据，但 warm reveal p95 ≤100 ms、hidden-idle RSS 降低 ≥15%、多轮资源回落等仍需同环境基线/最终原始样本。旧 benchmark 数字不能充当本次测量。
