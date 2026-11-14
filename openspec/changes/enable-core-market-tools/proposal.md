## Why

维护者确认 core 也要面向普通用户：安装宿主后，从市场按需求安装独立工具。当前 core 编译排除了工具依赖的原生服务，五工具仍走静态 React/Rust 组合，正式 Web runtime 关闭；补市场索引和禁用无效恢复按钮只能修正反馈，不能交付这一产品目标。

## What Changes

- 将 core 定义为“无预装工具、具备受控共享原生能力的插件宿主”，保留用户选择的轻量入口；它不再等同于完全排除原生工具能力的体积测量包。
- 五工具分别拥有清单、界面、领域逻辑、配置、翻译、资源、版本、构建入口与测试，构建独立 `.zplugin`；通过 GitHub Release 资产和静态市场索引分发。插件不导入同级插件或宿主内部实现。
- 在既有隔离 WebView/SDK 上完成受权限与资源租约约束的原生 API；Rust 保持系统资源、权威执行状态与生命周期所有权，不开放任意 invoke、脚本安装或 Rust 动态库加载。
- core 与 standard 使用相同插件包、版本和安装生命周期；standard 只是预装 Snap、Awake、Paper、Launch。File 按其独立引擎审批状态提供，未批准时不得宣称可用。
- 完成官方身份、版本/API/provider 兼容、审批、安装/更新回滚、停用/卸载清理与旧静态记录迁移；没有安装的工具不注册快捷键、托盘项、watcher 或后台任务。
- **BREAKING（未来新版构建配置与插件 API）**：调整 core 的构建语义并为新增能力定义显式版本窗口；旧 0.1.0 安装包不会因新增市场条目获得原生服务。上线前同步双语下载说明与真实能力矩阵。

## Capabilities

### New Capabilities

- `core-market-tool-distribution`: core/standard 分发、官方插件包、市场安装与更新、构建兼容及旧版本/数据迁移。
- `independent-tool-packages`: 插件代码、业务、版本、配置和资源的独立性，以及 SDK/API、原生 provider 与生命周期的边界。

### Modified Capabilities

无已归档主规范修改。相关能力目前仍在 `add-plugin-extension-api`、`standardize-zero-plugin-protocol`、`package-zero-trial-profiles` 等活跃变更中。本变更明确扩展“静态可插拔”到“市场可安装”，不自动勾选旧设备任务、同步或归档旧规范。

## Impact

- `src/core/pluginHost/`、`src/sdk/`、`src/appShell/`、`src/plugins/*/`，以及 Rust `plugins/`、`commands/`、`services/`、`bundled_plugins.rs`、窗口路由/capability。
- `scripts/build-profile.mjs`、插件构建/打包工具、market schema/索引与 `.github/workflows/`。根依赖与维护中的 SDK/库优先复用；仅在缺失通用能力时评估新依赖。
- 更新产品/打包/插件开发文档与双语 README；保留 `com.watson.ztool`、`~/.zero`、稳定的 `zero.*` 身份、现有偏好及用户数据。
- macOS 与 Windows 需分别验证下载包、隔离 WebView 和工具真实功能。File 签名审批不由本提案替代；实现、发布、安装器替换与设备验收分别记录。
