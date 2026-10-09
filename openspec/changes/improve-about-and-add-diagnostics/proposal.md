## Why

Zero 关于页缺少项目链接和排障入口，现有错误分散在终端、Launch/File 状态和扩展管理界面中，用户难以说明“哪个工具在哪一步失败”。随着五个内置工具和隔离插件协议演进，需要统一、默认脱敏且有资源上限的本地日志诊断能力，让开发者能够关联故障，同时让用户方便查阅和主动分享诊断摘要。

## What Changes

- 优化独立关于页：保留 Zero 标识、真实版本、运行时和插件概览，新增 GitHub、官网、打开日志目录、复制诊断信息、报告问题入口；官网按用户指定使用 `https://www.usezero.cn/`（网站尚未建设）。
- 将详细插件分类统计折叠为次要信息，采用符合 Zero 现有风格的分组按钮、中文/英文文案、键盘焦点和紧凑宽度下的纵向布局。截图仅参考红框的入口组织，不引入截图中的检查更新功能。
- 建立 Rust 宿主所有的结构化日志诊断服务：稳定事件码、来源、工具身份、操作关联、等级、脱敏、有限队列、轮转/保留、降级状态和主动清理。
- 为 Snap、Awake、Paper、Launch、File 及宿主安装/权限/生命周期提供接入规则和健康快照。保留既有用户错误与工具状态，将稳定诊断信息汇入公共服务；新增工具通过公共契约接入，不需要宿主 core 导入工具实现。
- 提供纯本地诊断摘要预览/复制与日志目录打开；报告问题仅打开 GitHub Issues 页面，用户自己选择粘贴和提交。默认不自动上传、不读取或附带原始业务文件。
- 为现有 Web 插件会话 Bridge 规划独立的只写诊断方法及 SDK 接入，宿主绑定真实身份、实时授权和限流；不向第三方开放日志读取/删除、剪贴板或日志路径，不为本变更开启尚未发布的公开插件运行时。

## Capabilities

### New Capabilities

- `about-support-actions`: 关于页身份、项目链接、响应式入口与操作反馈。
- `local-log-diagnostics`: 宿主本地结构化日志、持久化策略、资源限制、隐私和诊断操作。
- `plugin-diagnostics-integration`: 五工具、宿主及隔离第三方的事件/健康快照接入、关联与权限边界。

### Modified Capabilities

无。新增能力扩展 `main-window-shell` 已有独立关于 surface，不替换其现有 requirement 或窗口标签。设置与插件相关能力仍在活跃 change deltas 中，不冒充主规范，不同步/归档其他变更。

## Impact

- 后续实施涉及 `src/core/preferences/AboutPanel.tsx`、`i18n.ts`、`src/App.tsx`/`App.css`、typed service/hooks，Rust `commands/app.rs`、新增 `commands/diagnostics.rs` 和 `services/diagnostics/`、`lib.rs` 早期初始化/注册及相关调用者检查。关于窗口尺寸需随可达布局验证。
- 原生服务、插件自身的 frontend service/hooks、`bundled_plugins.rs` 提供事件和廉价快照适配；`plugins/{protocol,session,web_runtime}.rs` 与 `src/sdk/` 增量接入会话诊断；File engine 保留独立 capability 和已有 Rust-issued lease/session 通道。
- 依赖选择优先复用官方 Tauri opener，并基于已调查的 `tauri-plugin-log` 与 Tokio `tracing`/`tracing-appender` 比较日志方案；推荐后者的结构化字段和非阻塞 writer，设计说明轮转限制、第三方输出过滤及降级要求。提案不修改依赖锁文件。
- 与 `standardize-zero-plugin-protocol`、`optimize-preferences-settings`、`systematic-performance-and-code-optimization`、File/Launch/Snap 活跃变更协调：本变更只补诊断和入口，不改工具主要行为、File 包审批、插件 enablement 或既有性能证据。
- 保持 `com.watson.ztool`、`~/.zero`、`zero.preferences.v1` 与旧数据迁移兼容；目标为 macOS/Windows，Linux/mobile 仅描述不支持状态。测试、真实桌面流程和 Windows 设备证据分别记录，不以提案校验替代实现验证。
