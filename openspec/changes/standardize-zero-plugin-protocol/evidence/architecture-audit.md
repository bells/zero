# Zero 插件架构审查与行业对照

日期：2026-09-26。源码基线：`fb539f4034e758a0b65dbae01215a733feb3e136`；开始时工作区干净。本次为源码与契约审查，不是完整渗透测试、内存分析或设备验收。以下路径均相对仓库根；函数名用于复核定位。

## 总体判断

现有架构适合增量完善：React 插件自包含、单组合入口、Rust 服务边界、惰性窗口/插件加载和 File 独立引擎已经存在。真正缺少的是可以实测的第三方运行闭环、严格版本契约、宿主统一的资源所有权和可重复的开发者验收。Gemini 草案中的“新建 loader、全量迁移五个插件、直接开放 WASM/Sidecar”会重复基础设施并扩大信任边界。

## 已有基础与限制

| 范围 | 当前源码证据 | 判断 |
| --- | --- | --- |
| 前端隔离 | `src/appShell/bundledPluginModules.ts`、`pluginModule.ts`、五个 `plugin.tsx` | core 不导入具体插件、插件不导入同级插件；本轮直接运行 `moduleBoundaries.test.mjs`，3/3 通过。这是结构检查，不能证明所有动态行为隔离。 |
| Rust 分层 | `bundled_plugins.rs`、`lib.rs`、`commands/`、五组 `services/`；`src-tauri/tests/module_boundaries.rs` | 状态组合和 handler 注册集中，复杂能力在 services；Rust 结构测试仅覆盖部分模块/字符串，不能称为严格完备的静态依赖证明。 |
| 原生能力复用 | `services/native_resources.rs`、`services/tool_windows.rs`、`services/global_shortcuts.rs` | 文件/网络/窗口协调已有宿主服务，避免重复造通用能力。 |
| 安装与恢复 | `plugins/package.rs`、`registry.rs` | 已有压缩包检查、路径/符号链接限制、staging、持久化、内置恢复；不能把“已有安装”写成“已交付第三方生态”。 |
| 数据与平台 | `brand`、`capabilities/file-engine.json`、各平台服务 | 保留旧标识/数据迁移和 File 独立 capability；manifest 平台字段不等于该平台所有功能均可用。 |

## 按优先级排序的发现

P1 表示开放第三方之前应解决的功能/资源或契约问题；P2 是后续维护/性能改进。未发现可据本次证据宣称已被利用的 P0 问题。

| ID / 优先级 | 事实与定位 | 影响、置信度与处理 |
| --- | --- | --- |
| A1 / P1 | `App.tsx::GenericPluginPanel/pluginRecordToMeta` 使用 `convertFileSrc` + iframe；`ExtensionSurface.tsx` 仅设置 sandbox；`tauri.conf.json` 的宿主 CSP 为 `frame-src 'none'`。`createExtensionBridge` 在生产代码中只有定义，调用命中集中在测试；未找到实际消息 listener/port 绑定。 | 已确认源码集成缺口；真实 Tauri 加载结果本轮未运行。先建立资产协议、窄 CSP 与会话 transport；不得靠宽泛放开 iframe/文件访问解决。 |
| A2 / P1 | TS `validation.ts::isCompatibleZeroHostRange` 固定 0.1.0 字符串，Rust `package.rs` 只匹配当前版本的 `*`、精确值、`^`、`>=` 字符串；API 必须等于 `"1"`。TS 正则和 Rust `is_semver` 不是完整 SemVer，Rust 会忽略预发布尾部内容合法性。 | 不能正确处理 `^1.0.0`、上下界或升级后仍有效的范围。结构版本与 API 版本分别处理；共享边界 fixtures，以 Rust 为最终判断。 |
| A3 / P1 | `registry.rs::load_or_seed` 反序列化并 canonicalize/migrate；一般第三方记录未逐项重新验证兼容性。`set_enabled` 直接改 enabled/health。File 安装资产另有完整性检查。 | 安装时校验不能代替启动、启用、激活时校验。需避免再次启用覆盖 incompatible 诊断；不得把 File 特例当所有插件通用保证。 |
| A4 / P1 | `commands/plugins.rs` 在安装、停用、卸载分别硬编码 File 和 Launch 后处理；Awake 不在停用分支。`lib.rs` 初始化始终注册 Snap 快捷键，handler 再检查 enabled；停用仅对 Launch 重新同步注册。 | 停用工具不等于统一回收资源；从源码可判断 Awake 原生会话没有在此被显式停止，Snap 快捷键可能继续占位但不触发。需要宿主协调器及真实快捷键/进程验收，不能只补四个 JS hooks。 |
| A5 / P1 | `usePluginHost.ts` 每窗口持有 records；动作后本窗口重新 list，未订阅 registry revision。Bridge 捕获创建时的 record。`commands/plugins.rs` 未发布统一插件状态事件。 | 跨窗口 UI/授权可能过期。增加 Rust 权威 revision、会话失效和有界广播；没有证据说明目前发生了重复 IPC 事件风暴，主要问题是缺少统一同步。 |
| A6 / P1 | `plugins/runtime.rs::execute_plugin_entrypoint` 直接 Command 子进程并继承环境；stdout/stderr 在 `try_wait` 后才收集，未限输出，timeout 只 kill 直接子进程；无 OS sandbox。调用点目前只见测试。 | 大输出可能堵管道直到超时，后代进程持管道可能延迟收尾；权限标签不提供进程隔离。属于潜在执行路径风险，不声称当前 UI 已暴露可利用入口。公共 v2 不提供 process runtime；旧路径如后续接入，须独立进程树/输出/环境/权限威胁模型。 |
| A7 / P1 | `extensionBridge.ts` 部分 optional host API 用 `?.`，缺少 provider 可返回成功/undefined；方法名是 string，成功失败 envelope 可同时缺字段；`buildExtensionSurfacePolicy` 的 CSP 字符串未在组件施加。 | SDK 不能以这些类型宣称端到端可靠。未知方法/provider 缺失须报错，输入 unknown 必须运行时校验；CSP 必须由实际响应执行。 |
| A8 / P2 | `registry.rs::with_registry` 的单 Mutex 包裹 install/validate/extract/save；同锁支撑同步 list 和状态栏读取。已有 `spawn_blocking`。 | 移到 worker 并未缩小临界区，安装可能拖慢其他读者。拆成 prepare/commit + generation 校验；沿用性能变更 9.3，不重复开一个总优化项目。 |
| A9 / P2 | 五个 TS descriptor 与 `registry.rs::bundled_*_record` 重复构造清单；权限/API 常量还在 TS validation/contracts 重复。`status_bar.rs` 有工具专用 action/icon 分支。 | 明确哪些是静态元数据漂移、哪些是必要原生适配；生成两端静态目录，保留插件专属原生实现。不要把所有状态栏行为强行迁入 untrusted JS。 |
| A10 / P2 | `commands/caffeine.rs::schedule_expiry` 每次有限时长启动睡眠 OS thread；generation 能阻止过期回调错误停用，但旧 thread 未取消。 | 频繁重新设置长时长会暂留多个线程；可取消的单 expiry owner 值得处理。尚未做线程/RSS实测，不能写成已证实内存泄漏。 |

| A11 / P1 | `plugins/package.rs::download_package_to_staging` 先 `response.bytes()` 收集完整响应，之后写 staging；64MiB 包上限在后续包校验中使用，不能限制下载时峰值。 | 公开安装路径应流式限长、增量摘要并有失败清理，覆盖未知 Content-Length 和重定向；目前仅源码风险确认，未发起大响应实验。 |

## 性能与内存审查边界

- `main.tsx` 和 descriptor 已按窗口/面板惰性加载，File 大型转换依赖独立；不建议本轮引入全局 SDK 扫描或全插件预热。
- Launch 的 query generation、合并调度和图标批量机制已在源码；Snap 已使用 raw bytes/token/lease，Paper 已回收 Blob URL，File 已有 sequential queue 和 idle generation。不要重新提出“去除全量 Base64”“首次引入取消”并冒称新收益。
- 多图标托盘通过 `refresh_status_bar` 聚合 registry、设置与 Awake 状态；动态更新仍有专用分支。没有本次 profile，先测 native icon 重建次数、解码次数与耗时，再决定缓存/差量更新。
- 将 A8、A10 作为明确工作项；生命周期引入后测 10 次加载/卸载、监听器/port/快捷键/进程/租约/暂存文件归零，采集进程树 RSS/CPU 与冷/热激活 p50/p95。资源计数测试不能替代 WKWebView/WebView2 内存结果。
- 既有性能变更中的 100ms warm reveal、15% RSS 目标仍是原变更待验收目标，不在此补打勾，也不凭规范保证达标。

## 对 Gemini 草案的逐项校准

| 草案 | 采用的调整 |
| --- | --- |
| “双层版本”但列出三个版本 | 至少三条独立版本轴；另分 Manifest schema、SDK npm 包和 File engine protocol。SemVer 定义版本排序，并不定义 `^`/`>=` 范围语法。 |
| `id: zero-plugin-snap`、`name: Zero Snap` | 保留 `name/id = zero.snap`；显示名用 displayName，避免打断 registry、偏好、快捷键和历史 ID 迁移。 |
| `plugin.json / manifest.json` 二选一 | Zero 继续仅用根 `manifest.json`；Codex 文件名属于其协议，不是行业必须照搬的名字。 |
| `entry.ui = dist/index.js` | Web 运行入口为包内 HTML，代码与资源由它加载；不能把第三方 JS 动态 import 到宿主 React realm。 |
| `fs:read / screen:capture` | 继续使用点分权限。不要新增泛文件读权限或把 Snap 原生截图直接开放；新 SDK 能力只列实际提供者。 |
| 单一 slot | 使用 `contributes.views/commands/statusBarItems/keybindings`，分开可见位置与运行时信任；settings/about 为宿主区域。 |
| onInstall 下载 Sidecar | 安装/更新由 Rust 校验、staging、提交，默认不执行插件安装脚本；后续受信引擎下载须独立设计。 |
| onUninstall 自动删配置 | 默认删除包和缓存、保留用户数据；只有明确“删除插件数据”操作才清除插件所有的数据。清理不能依赖插件代码愿意执行。 |
| 新 `services/plugin_host.rs` | 扩展 `src-tauri/src/plugins/` 下已有模块及宿主协调接口，不创建第二个 registry/loader。 |
| 五个工具作为第三方范例 | 五个工具作为内置适配验收，另建最小第三方示例。File 的签名引擎不是一般 Web 插件。 |

## 官方资料对照（2026-09-26 实际读取）

1. [OpenAI Plugins](https://developers.openai.com/codex/plugins)：插件组合 skills、MCP、hooks 等能力；宿主 sandbox/approval 和外部服务认证分别生效；卸载 bundle 不等于断开服务连接。借鉴“包、授权、运行能力分别管理”，不把 Zero 设计成 AI 工作流平台。
2. [OpenAI Build plugins](https://developers.openai.com/plugins/build/plugins)：当前文档推荐根 `plugin.json` 的 portable 格式，`extensions.com.openai` 为平台扩展，`.codex-plugin/plugin.json` 为兼容 fallback；skills/MCP 使用约定目录。借鉴稳定身份、单一权威字段和显式 legacy 适配。不能把本机较旧 scaffold 的 `.codex-plugin` 必选规则当最新公开标准。
3. [VS Code Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)：借鉴 engines、contributes、activationEvents、publisher/显示名分离。其 Node 卸载脚本并非 Zero 必须开放的能力。
4. [VS Code Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy)：借鉴首次使用时 activate、deactivate 与 subscriptions。Zero 的强制撤销由 Rust 承担，hook 只是合作式清理。
5. [VS Code Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)：区分 Node 和 WebWorker runtime；“进程分离”不能直接等同安全沙箱。Zero 无需为了 SDK v1 新嵌入 Node。
6. [SemVer 2.0.0](https://semver.org/)：采用精确版本合法性、预发布优先级和 build metadata 不影响排序；范围语法另外定义。

OpenAI 直连曾返回 Forbidden，使用用户配置的本地代理读取到了正文；VS Code 和 SemVer 正文可直接获取。以上资料只作为设计参考，无插件安装、账号连接或外部写入。

## 与活跃 OpenSpec 的交界

| 现有 change | 本提案关系 |
| --- | --- |
| add-plugin-extension-api | 接续其包/市场/lifecycle 基础，补真实 Bridge 与兼容性；新格式 v2 不重定义旧 v1 全部语义。旧手工 smoke 保留，后续同步按基础规范先、新规范后。 |
| reorganize-project-modules | 保留 module/peer 边界；统一元数据与资源协调是增量。 |
| systematic-performance-and-code-optimization | A8 对应其 9.3；设备 RSS、延迟、其他旧门禁继续归原 change，实施时共享证据而不重复认领完成。 |
| add-quick-launcher-plugin / 状态栏相关 changes | 快捷键/贡献派发复用现有 indexed ID/native action；不开放任意命令行。 |
| add-file-plugin / bundle-zero-file-offline-engines | 保留签名、审批、租约、平台 exporter 和语料门禁；不因共享 SDK 协议解除 `document.convert` 的第一方限制。 |
| rename-ztool-to-zero | 只消费兼容映射，不改 bundle id 或删除旧目录。 |

## 本轮验证

仅运行无需 fixture 的前端源码依赖边界测试（3/3）；协议文件/规范校验结果见 `verification.md`。未运行全量应用测试、Tauri 开发会话、macOS/Windows设备验收或新性能采样。审查发现是源码证据，修复任务保持未完成。
