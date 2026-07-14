## Why

ZTool 目前只有截图和咖啡因两个内置工具，缺少一个能验证“远程数据 + 本地缓存 + 原生系统能力”完整插件链路的第三个工具。Bing 每日壁纸可以在保持托盘窗口简洁的前提下，为用户提供最近壁纸浏览、下载和一键设为桌面的高频体验，同时推动插件宿主补齐受权限约束的网络、二进制存储和壁纸能力。

## What Changes

- 新增内置工具插件 `bing-wallpaper`（注册表名称遵循现有约定使用 `ztool.bing-wallpaper`），在紧凑卡片中展示 Bing 每日壁纸、标题/地点/版权信息，并支持最近 10 天前后浏览。
- 插件激活时先读取可用缓存，再由 Rust 异步刷新 Bing 图片元数据和缺失图片；网络失败时保留离线浏览能力和可恢复的错误反馈。
- 将图片和索引缓存到 `~/.ztool/data/wallpaper/`，只保留最新 10 个日期条目，并提供保存到下载目录与设为系统壁纸两个明确操作。
- 扩展插件宿主的权限与 Bridge 契约：复用 `network` 和 `storage.plugin`，新增 `system.wallpaper`；所有网络请求、插件作用域文件写入和系统壁纸切换均由 Rust 执行。
- 不向插件开放任意绝对路径写入或不受限 URL 请求；缓存写入限制在插件数据目录，Bing 请求限制为 HTTPS 和受信任主机，设置壁纸只接受宿主已验证的本地图片。
- 将 `bing-wallpaper` 接入插件注册表、导航、偏好可见性、简体中文/英文文案与现有内置渲染器映射，并补齐 Rust/TypeScript 对称数据契约和自动化测试。
- 桌面端优先支持 macOS 和 Windows；Linux 在所选壁纸后端可确认支持的桌面环境中启用，否则返回明确的“不支持”错误。移动端本次不提供系统壁纸操作，但 UI 和数据模型保持响应式、可扩展。
- 不在本次变更中引入 `plugin.wasm` 运行时、开放任意 shell/文件系统访问，或构建 Bing 之外的通用图库/账号/收藏功能。

## Capabilities

### New Capabilities
- `bing-wallpaper`: 定义最近 10 天壁纸加载、缓存优先展示、历史导航、元信息、下载、应用、清理和错误恢复等用户可观察行为。
- `plugin-native-resource-api`: 定义插件使用受控网络请求、插件作用域二进制存储和系统壁纸能力时的权限、路径约束、Rust/TypeScript 契约与结构化错误行为。

### Modified Capabilities
- None.

## Impact

- 前端插件宿主与 UI：`src/plugins/pluginHost/` 的权限/Bridge/内置插件契约，新增 `src/plugins/bingWallpaper/`，以及 `src/App.tsx`、偏好模型、i18n 和紧凑卡片样式。
- Rust/Tauri：新增壁纸数据模型、Bing HTTP 客户端、缓存服务、系统壁纸服务和薄 command；更新插件权限校验、命令注册和平台条件编译。
- IPC：新增元数据、缓存快照、刷新/下载/应用输入输出和结构化错误类型，Rust 使用 `serde`，TypeScript 使用显式 interface，字段命名在边界处保持对称。
- 本地数据：创建并维护 `~/.ztool/data/wallpaper/`；实现临时文件下载、原子替换、路径校验和最多 10 个日期条目的滚动清理。
- 依赖与安全：评估并锁定维护活跃、许可证兼容的系统壁纸 crate（优先验证用户建议的 `wallpaper`），复用现有 `reqwest`；不授予 WebView 直接网络或 Tauri 原生权限。
- 验证：增加元数据解析、日期排序、导航边界、缓存清理、路径防护、权限拒绝、下载/应用状态、平台错误和 Rust/TS 合约测试，并通过真实 Tauri 窗口手动验证浏览、离线缓存、下载和设置壁纸。
