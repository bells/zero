# Zero 项目全景与维护地图

2026-10-15 官网发现增量：四个在线工具补齐双语能力搜索标题、明确的目录描述、步骤和输入/输出示例，以及基于真实控件标签的浏览器 Agent 说明。HTML、WebApplication featureList 与 AI 全文索引从共享指南生成，索引页数仍为 28；不增加远程计算接口或改变桌面交付。实现/验证见[增量记录](../openspec/changes/extend-web-tools-batch-and-diff/evidence/discovery-2026-10-15.md)，部署仍独立执行。

2026-10-15 官网工具增量：时间戳页增加逐行批量转换、原行号/错误保留与完整 JSON 导出；新增双语文本/UTF-8 文件对比，提供本地 worker、行级/行内高亮、并排/统一视图、差异导航及有界长行展示。目录/搜索为四工具，全站 28 个索引页面。维护入口见[官网指南](website.md)，验收及实际边界见[本次记录](../openspec/changes/extend-web-tools-batch-and-diff/evidence/implementation.md)。不涉及桌面功能或发布；工作区完成不代表生产部署。

2026-10-14 官网在线工具增量：独立 `website/` 增加双语 `/tools/` 目录及时间戳、JSON、Base64/URL 工具，保留原五工具说明 URL。纯 TS 计算层与浏览器 UI/worker 分离，输入只在当前页本地处理，增强 JSON 编辑按需加载。后续桌面离线插件已纳入方向，当前不构成桌面交付承诺。验收结果见[本次记录](../openspec/changes/usezero-web-tools-extension/evidence/implementation.md)，维护入口见[官网指南](website.md)。当前工作区实现与本地检查不代表生产部署或搜索收录。

2026-10-12 官网搜索/AI 增量：独立 `website/` Astro 站已增加双语五工具说明、安装指南与 FAQ，共 18 个可索引页面；搜索标题、共享实体图、sitemap 与同源生成的 llms 索引已补齐。错误 HTML noindex，`website/vercel.json` 提供本地化 404 路由；Vercel Preview 自动 noindex，显式 `SITE_PREVIEW=0` 保持生产索引。字体迟到导致英文首页偏移已修复。官网原版已部署至 www.usezero.cn，但本轮源码未提交/部署；Search Console/Bing 验证由用户留待后续。验收与托管边界见[增量记录](../openspec/changes/add-zero-product-website/evidence/discovery-verification-2026-10-12.md)，维护入口见[官网指南](website.md)。下述桌面证据不覆盖官网，官网检查也不替代原生/发行验收。

2026-10-11 Snap/OCR 增量：Snap 左/右键改为与 Awake 共用宿主机制的原生菜单，废弃 `snap-menu` WebView；截图会话合并重复启动，并将指定显示器捕获、overlay 与窗口候选绑定到同一快照。选区内部可用手掌光标平移。新增 macOS Vision 共享离线 OCR，Snap 结果在 main 中编辑并显式复制，File 无文字扫描页逐页识别后生成可编辑 DOCX。File 候选为 `1.2.0`、run 协议为 `2`，仍未批准。合成混合 PDF 的真实 macOS debug 转换及 TextEdit 修改/保存/重开已验证；TextEdit 重写了分页结构，不构成版式保真证明。原生菜单视觉、双屏/混合 DPI、完整 Snap OCR 交互、Windows 和签名包仍待验收，详见[本次记录](../openspec/changes/enhance-snap-and-share-offline-ocr/evidence/verification.md)。下述旧日期基线不覆盖此增量。

2026-10-11 Launch/搜索入口增量：默认 macOS Option + Space、Windows Ctrl + Alt + Space；Launch 重复标签已移除。已打包 release 启动时为五工具生成系统应用搜索入口，并通过单实例保留导航目标。前端/Rust 和 Windows 交叉编译通过；macOS debug 冷启动及 Snap/File 入口转发已验证，物理全局快捷键、实际搜索索引及 Windows 设备仍待验证。详见[本次证据](../openspec/changes/refine-launch-and-system-search/evidence/verification-2026-10-11.md)。

2026-10-09 设置/高亮增量：main 内完整设置视图已接入，分类和搜索复用原设置中心；“返回工具”保留已访问工具子树，隐藏时暂停展示轮询。兼容 IPC 通过最新目标/revision 快照交接，不再创建独立 preferences 窗口。macOS 已接入组合按钮 cell mask 与局部背景绘制，高亮跟随稳定工具 ID，主 Ø 覆盖整组；实际系统栏按压/菜单视觉与 Windows 仍有未完成项。提交前完整 Rust 串行复测通过，先前进程超时记录保留。源码、自动检查和本机设置交互的独立证据见[补充验收记录](../openspec/changes/refine-tray-and-workspace-navigation/evidence/verification-supplement-2026-10-09.md)。此前数字不覆盖此增量。

2026-10-09 导航增量：托盘采用 52px 单行图标导航与独立内容滚动；main 侧栏支持 192px/64px 展开收起、偏好保存与 800px 自动紧凑，工作区由插件保留唯一可见标题。原生 host 接入 tray generation/失焦延后重查与 dialog guard，macOS 接入组合单元 AppKit tooltip rect。最终前端 339 项、Rust 沙箱外串行 325 项通过（2 ignored）；真实外部失焦、OS hover、触控板/多屏和 Windows 等门禁仍未完成，见[导航验收记录](../openspec/changes/refine-tray-and-workspace-navigation/evidence/verification-2026-10-09.md)。旧基线证据保留日期语义。

2026-10-09 增量：关于窗口更新为 500 × 560（最小 420 × 360），显示原生版本、GitHub/官网地址与支持诊断入口。`services/diagnostics` 在迁移前建立本地安全 JSONL/ring，五工具通过组合层接入 cached health，第三方开发协议增加独立 `diagnostics.write`。接入与隐私契约见[诊断指南](diagnostics.md)，检查及仍未完成的实机门禁见[本次证据](../openspec/changes/improve-about-and-add-diagnostics/evidence/verification.md)。当前是未提交的工作区变更；下述旧基线和历史证据保留日期语义。

核对日期：2026-09-25。源码基线：`3120f5d3162440a69f561ea114db8ea9697921df`。本次是在该基线上的文档校准和一处测试模块排序修正，不是版本发布或完整安全审计。下列检查属于本机 macOS；未重新运行 Windows/Linux 设备测试、安装包测试或交互式截图流程。

## 当前结论

Zero 已形成「托盘快速入口 + 主窗口工具/设置视图 + 独立关于 + 插件工具窗口」的桌面工具箱，包含 Snap、Awake、Paper、Launch、File 五个内置插件。主要模块边界已有自动测试约束；功能完成度不能只看插件目录、manifest 平台列表或任务勾选。

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

2026-09-28 插件协议实施中：参见 [Protocol v1 当前状态](plugins/protocol-v1.md) 与 [原生隔离证据](../openspec/changes/standardize-zero-plugin-protocol/evidence/webview-isolation.md)。已接入 SemVer/Schema、流式包限额、共享内置 metadata、独立 WebView/session/窄 Bridge、SDK 与 notes 开发闭环；registry revision 及部分内置 lifecycle 已实现。公开运行时仍关闭，network provider、命令激活、完整更新事务和设备门禁仍未完成。下方 2026-09-25 的检查数字保留为历史记录。

2026-10-07 续做：恢复内置工具接入共享操作锁，并补齐恢复持久化失败回滚、重启/迁移 revision 连续性及取消后存储提交保护测试。前端 313 项、Rust 沙箱外串行 296 项（1 ignored）、构建和 bundle gate 通过；macOS 临时 registry notes 原生闭环通过。后续生成本地 debug `.app`，以仅用于测试的配置增加可见主窗口，已完成真实主窗口/偏好/关于、五工具面板、Launch 原生查询和公开 runtime 拒绝的交互 smoke。此前裸开发进程的自动化识别问题已绕过；完整审批/双窗口同步/恢复、Windows 和发行包门禁仍待完成。详见 [conformance 记录](../openspec/changes/standardize-zero-plugin-protocol/evidence/conformance-2026-10-07.md) 与 [macOS UI 记录](../openspec/changes/standardize-zero-plugin-protocol/evidence/macos-ui-2026-10-07.md)。

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
| `main` | 920 × 660（最小 760 × 520）工具/设置主窗口；兼容 `show_preferences_window` 切换到设置，返回保留会话上下文 |
| `about` | 500 × 560 独立关于窗口；诊断内容内部滚动 |
| `launcher` | Launch 快捷键/状态栏入口，共享索引与查询 UI |
| `paper` | Paper 专属窗口 |
| `capture` / `pin-*` | macOS 截图编辑 / 钉图 |
| `zero-file-engine` | 隐藏的文件转换引擎，使用独立 capability 和调用者限制 |

默认 capability 覆盖上述宿主/工具窗口，**不包含** File 引擎；引擎使用 `capabilities/file-engine.json`。前端未知 label 回退托盘，File label 在 `main.tsx` 中单独处理。改变窗口时需同时检查路由、capability、原生调用者约束、焦点/失焦和销毁逻辑。

| 工具 | 主要源码 | 当前实现与平台边界 |
| --- | --- | --- |
| Snap (`zero.snap`) | `src/plugins/screenshot/`、`services/screenshot.rs`、`services/screenshot/` | macOS 原生动作菜单、单显示器编辑、选区拖动、窗口候选、尺寸/圆角、标注、复制/保存/钉图和 OCR；Windows 系统截图启动器；Linux 截图不支持 |
| Awake (`zero.awake`) | `src/plugins/caffeine/`、`services/caffeine.rs` | 时长/状态；macOS `caffeinate -d -i`，Windows `SetThreadExecutionState`；其他平台返回不支持 |
| Paper (`zero.paper`) | `src/plugins/bingWallpaper/`、`services/bing_wallpaper/` | Bing 元数据、最多 10 条缓存、下载/应用；Linux 应用依赖桌面后端，不等于已有设备验证 |
| Launch (`zero.launch`) | `src/plugins/quickLauncher/`、`services/quick_launcher/` | 中英文/拼音模糊搜索、图标、成功使用记录、启动/聚焦/系统设置；macOS 应用包、Windows Start Menu；Linux/mobile 不支持 |
| File (`zero.file`) | `src/plugins/file/`、`services/file/`、`plugins/engine_assets.rs` | PDF→DOCX 内置 macOS/Windows 路径；DOCX→PDF 内置 macOS 11+ 路径；Windows 后者无内置 exporter，可选外部兼容 provider 独立存在 |

默认快捷键为 Snap `CommandOrControl+Shift+A` 和 Launch：macOS `Alt+Space`（Option + Space），Windows `Control+Alt+Space`；全局快捷键与工具可见性在设置中管理。manifest 的平台声明可能比实际原生能力宽，应查询真实 capability/provider 状态。

## IPC、数据与兼容性

- 截图当前使用 `CaptureSessionPayload.media` 与短期 token 读取 raw bytes。导出先调用 `prepare_screenshot_commit` 取得一次性 lease，再通过 `upload_screenshot_commit` 提交 PNG raw body，并携带 lease/session/action headers；Rust 决定保存路径并校验会话、窗口、尺寸和有效期。
- 新截图 session/media/lease 结构使用 `serde(rename_all = "camelCase")`；旧 capability/start response 仍有 snake_case。TS 接口和 invoke 必须逐项匹配，不能统一替换命名。
- `CaptureDisplaySnapshot` 明确逻辑 frame、实际物理 frame、源像素和每轴比例；禁止使用目标屏 scale 乘全局原点。共享 `services/ocr/` 只接收受控 PNG，Snap adapter 限 active session/原始 crop，File adapter 限 engine run/page/版本/单次上传 lease。两插件不相互导入；结果不写持久历史或正文诊断。
- 启动器接收宿主索引生成的 `itemId`，不开放任意路径、命令行、Bundle ID 或 URI 执行；原始搜索词不持久化或上传。
- 壁纸由 Rust 限定网络目标、图片和插件目录，WebView 不获得任意文件访问；缓存失败应保留可用旧快照。
- 安装包路径为 `~/.zero/plugins/<plugin>/<version>/`；Paper 为 `~/.zero/data/wallpaper/`；Launch 为 `~/.zero/data/quick-launcher/`。File 临时转换数据在 Tauri app cache 的 `file-conversion` 下，不能与插件安装目录混为一谈。
- 偏好键为 `zero.preferences.v1`，兼容读取 `ztool.preferences.v1`。旧 `~/.ztool` 迁移不删除原数据，规范路径已有数据优先。
- `com.watson.ztool` 是升级兼容标识，不能为了品牌一致性随意改名。四个历史插件 ID 映射与当前五个内置插件并不矛盾，File 没有旧 ID 映射。

## Zero File 的关键状态

`file-engine-policy.json` 的 `approvedEnginePackages` 为空；候选 `1.2.0` 的 `approved` 为 false，`packageSha256` 为 null，签名包完整语料、打包 smoke、发布测量和 Windows runtime 标志均未通过。当前源码 PDF→DOCX 只生成可编辑正文：可靠文字页直接提取，无文字非空页在 macOS 用共享 Vision OCR，普通/扫描空白页保留分页，不回退整页图片。Windows 仍无 OCR provider；同页文字加局部扫描、真实表格/公式/复杂旋转排版不承诺完整恢复。`engine/pdfComplexity.ts` 负责阅读顺序，`pdfOcr.ts` 负责有界逐页 raster 和像素坐标映射，`editableDocx.ts` 负责 OOXML，Rust `services/file/editable_output.rs` 在提交前检查最低正文语义。源码测试与 provider 启用不能代替包审批。

开发命令 `ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev` 仅在 debug 构建中允许源码引擎 fallback。普通 `pnpm dev/build` 准备资源，不等于安装/批准签名包。正式包仍必须经过签名、摘要、安装资产和版本租约校验。

“请修复或重新安装 Zero File 插件”应从 capability/provider diagnostic、已装版本、策略完整性、隐藏窗口 URL 与 readiness 逐层诊断。本次发现的默认策略与开发开关只构成排查依据；没有重现此前用户会话，不能宣称修好了那次报错。

## 工程与发布

当前环境为 Node 24.20.0、pnpm 10.33.0、Rust/Cargo 1.95.0、OpenSpec 1.12.0。锁定的 Vite 7.3.2 需要 Node `^20.19.0 || >=22.12.0`，PDF.js 6.2.108 需要 `>=22.13.0 || >=24`；README 原来的 Node 18+ 已不适用。CI 配置使用 Node 24。

CI 覆盖 macOS/Windows 编译和 Rust 测试，完整前端测试只在 macOS 运行；Windows 有 File engine 构建与 packaging source-contract 检查。当前没有 Linux/mobile CI，CI 也没有覆盖所有本地门禁（如 Clippy、完整 OpenSpec 校验与 bundle budget）。

Package Zero 工作流新增 core（无工具）和 standard（Awake、Paper、Snap、Launch）× Apple Silicon/Intel macOS/Windows 六组产物，手动运行上传 Actions artifacts，版本 tag 运行附加到 Draft Release。构建裁剪与大小/校验清单见 [打包指南](packaging.md)；当前实施证据单列，不能从源码配置推断 Hosted Actions 成功。bundle identifier 保持不变。

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
