## Why

Zero 已有截图、咖啡因和 Bing 壁纸三个内置工具，但用户仍需要离开键盘、进入系统启动器或逐层打开设置，才能启动/切换应用和进入常用系统设置。新增第四个内置 Zero Launch，可把应用发现、模糊检索、运行状态感知和系统设置直达收敛为一个本地优先、毫秒级响应的入口。

## What Changes

- 新增内置工具插件 `quick-launcher`，注册表名称遵循现有约定使用 `zero.launch`，作者为 `bells`；接入现有插件注册表、主窗口导航、偏好可见性、渲染器映射和中英文文案。
- 新增可由全局快捷键唤起的轻量 Launcher 窗口，同时在插件面板提供同一搜索体验；支持 `↑`/`↓`、`Enter` 和 `Esc` 的完整键盘操作。
- 在 Rust 端索引 macOS 应用包和 Windows 开始菜单应用入口，归一化名称、路径、Bundle ID/可执行身份、图标引用和运行状态；Linux 首版明确返回不支持，不伪装为空结果。
- 新增应用与系统设置的统一模糊检索：支持英文名称、中文、拼音全拼、拼音首字母、词首缩写和受控 Alias，并将匹配质量、运行状态和本地使用频率组合排序。
- 新增安全的启动/切换和设置直达能力：已运行应用优先切到前台，未运行应用启动；设置项通过宿主维护的白名单 ID 映射到 macOS `x-apple.systempreferences:` 或 Windows `ms-settings:` URI。
- 在 Rust 中维护内存索引，并将版本化应用索引和使用统计原子持久化到插件数据目录；启动时先加载缓存、后台刷新，并监听已知应用目录变化进行去抖增量更新。
- 扩展 Rust/TypeScript 对称的插件权限和宿主 Bridge，提供受控的 `launcher.scanApps`、`launcher.search`、`launcher.launchOrFocus`、`launcher.openSystemSetting` 能力；调用方只能使用宿主签发的条目 ID，不能传入任意路径、Bundle ID 或 URI。
- 不在本次变更中引入 `plugin.wasm` 运行时、联网搜索、文件/网页搜索、命令执行器、用户账号或云同步；Zero Launch 复用当前内置 `webview` 插件与 React renderer 架构。

## Capabilities

### New Capabilities

- `quick-launcher`: 定义第四个内置工具、Launcher 窗口、统一结果列表、键盘导航、运行状态反馈、启动/切换、系统设置直达和频率加权等用户可观察行为。
- `application-search-index`: 定义 macOS/Windows 应用发现、系统设置目录、规范化身份、拼音/别名模糊匹配、缓存优先加载、后台刷新、目录监听和性能降级行为。
- `plugin-launcher-api`: 定义应用读取、执行、窗口聚焦和系统设置打开权限，以及类型对称、条目 ID 受限的 Tauri IPC 与 Extension API Bridge 行为。

### Modified Capabilities

无。

## Impact

- 前端：新增 `src/plugins/quickLauncher/`，并调整 `src/plugins/pluginHost/` 的 bundled manifest、renderer/permission 契约，`src/App.tsx`、`src/main.tsx`、偏好模型、i18n、Launcher 窗口路由和紧凑搜索样式。
- Rust/Tauri：新增 launcher commands/services/platform adapters、索引状态、缓存与 watcher；更新 `src-tauri/src/lib.rs`、插件 contracts/registry/runtime、Tauri window/capability 配置和全局快捷键协调。
- 跨端契约：新增应用/设置条目、搜索请求/结果、索引状态、激活结果、图标结果和结构化错误的 Rust/TypeScript 对称类型；新增 `system.apps.read`、`system.apps.execute`、`system.window.focus`、`system.settings.open` 权限。
- 依赖：实施前验证并锁定活跃维护的 Rust 模糊匹配与拼音库；平台层优先复用现有 `windows` crate，并评估维护活跃的 AppKit 绑定与 Windows `.lnk` 解析库，所有第三方依赖封装在可替换适配器后。
- 数据与隐私：本地插件数据目录新增版本化索引、使用统计和可重建图标缓存；不上传查询、应用清单或使用历史。
- 验证：新增纯排序/查询、缓存迁移、目录事件合并、权限拒绝、IPC 序列化和平台适配器测试，并在真实 macOS/Windows Tauri 应用中验证快捷键、焦点切换、URI 跳转、冷启动缓存和安装/卸载应用后的刷新。
