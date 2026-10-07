## Why

Zero 已有五个内置模块、`.zplugin` 安装与权限注册体系，但尚未形成可对外承诺的插件开发协议：兼容性检查是字符串白名单，第三方界面与消息 Bridge 尚未连通，生命周期与元数据仍有多处特殊分支。应先在当前代码上完成架构校准，再以可验证的 Web 插件闭环推进 Protocol / SDK v1，避免直接套用通用模板重写现有系统。

## What Changes

- 交付源码架构审查、行业对照、目标架构图、Manifest/IPC/SDK 接口草案及分阶段验收任务。本轮仅创建提案，运行时代码须在设计确认后实施。
- 在现有根目录 `manifest.json` 上新增 `schemaVersion: 2` 格式，保留 `.zplugin`、稳定插件标识、点分权限及 `contributes`；明确宿主版本、API 协议版本、插件版本、SDK 包版本与清单结构版本的独立含义。
- 新格式要求真实 SemVer 兼容检查、平台/能力检查及明确诊断；旧清单通过显式 legacy 适配，保留 `engines.ztool` 读取，不自动抬升权限或宣称完整 API 1.0 支持。
- 建立受限 Web 插件会话、可实际加载的资产与 CSP 策略、类型化 Bridge、按需激活、资源撤销、跨窗口状态同步和可恢复更新流程。
- 让五个内置模块共享清单元数据与宿主生命周期协调器，同时保留编译期原生服务及现有惰性加载。内置工具不是可直接移植的第三方 SDK 示例；另提供最小第三方 Web 示例。
- SDK 先作为仓库内独立包边界设计，核心不依赖 React/Tauri，React hook 为可选适配；不在本轮发布 npm 包，不预先锁定 `@usezero/sdk` 名称归属。
- **BREAKING（仅新清单格式）**：拒绝缺失 engines、未知权限、未知运行时和无效贡献引用；新公开 Web profile 不开放 binary/script/WASM、任意 Rust 动态加载或安装脚本。旧格式保留可诊断适配，其受控进程路径不作为本轮 SDK 支持承诺。

## Capabilities

### New Capabilities

- `plugin-protocol-compatibility`: 版本、Manifest v2、legacy 适配、身份及平台/权限策略。
- `plugin-session-lifecycle`: Web 会话、Bridge、按需激活、强制清理、事务更新与多窗口状态。
- `plugin-sdk-conformance`: SDK 边界、共享内置元数据、第三方示例和可复现协议验收。

### Modified Capabilities

无已归档主规范修改。主规范目前仅有 `main-window-shell` 与 `caffeine-duration`；相关插件能力仍位于活跃变更中。本提案以新能力路径表达增量约束，不冒充已存在主规范，也不自动同步或归档旧变更。

## Impact

- 后续实施涉及 `src/core/pluginHost/`、`src/appShell/bundledPluginModules.ts`、五个插件的 descriptor、`src-tauri/src/plugins/`、`commands/plugins.rs`、`bundled_plugins.rs`、快捷键/状态栏协调器，以及有范围的 CSP/资产路由配置。沿用现有 Rust 插件目录，不另造平行的 `services/plugin_host.rs` 加载器。
- 依赖候选为成熟 SemVer/JSON Schema 库及共享契约 fixtures；先验证跨语言语义、维护状态和引入成本，再锁定版本。现有传递依赖不能替代显式依赖。
- 与 `add-plugin-extension-api`、`reorganize-project-modules`、`systematic-performance-and-code-optimization`、Launch/File/状态栏活跃变更的交界见 [审查](evidence/architecture-audit.md)。旧人工门禁继续保留。
- 保持 `com.watson.ztool`、`~/.zero`、旧数据迁移、`zero.preferences.v1`、现有五个 ID、File 签名审批/租约边界及 macOS/Windows 真实能力差异。本轮不升级宿主版本、不批准 File 引擎、不扩展 Linux/mobile 支持声明。
- 验证分为提案格式/接口草案检查、实施后的契约与负面测试、真实 Tauri 多窗口/权限/恢复测试及设备性能测量；规范通过不代表运行时完成。

## Confirmed runtime revision (2026-09-27)

用户依据 macOS 隔离探针明确选择独立 WebView 工具窗口：main/tray 保留入口，第三方内容由原生窗口承载。详见 design 与 evidence/webview-isolation.md；不迁移五个内置工具。
