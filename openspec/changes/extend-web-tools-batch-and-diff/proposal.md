## Why

官网时间戳工具目前只能逐条转换，核对多条日志时间时需要重复操作；在线工具箱也缺少直接比较两段文本或两个本地文本文件的入口。延续现有浏览器本地处理架构，补齐这两种常见开发工作流。

## What Changes

- 在现有双语时间戳页面增加“单条 / 批量”模式，保留当前时钟与单条转换；批量按行输入，复用严格单位、日期和时区语义，逐行报告结果和错误，支持复制与下载完整结果。
- 新增 `/tools/diff/`、`/en/tools/diff/` 文本/文件对比页面。参考用户截图的左右原始/更改后文本、各侧打开文件和显式“查找差异”操作，提供行号、增删及行内差异、差异统计与前后导航，窄屏提供统一视图。
- 文件范围为浏览器本地读取的 UTF-8 纯文本文件（可带 BOM，包括代码、JSON、Markdown、CSV 等）；不包含图片、PDF、Word、Excel、文件夹或远程文件对比。文件内容和粘贴文本共用同一比较逻辑。
- 所有内容仅在当前页面本地处理，不上传、不保存历史、不进入 URL/日志/遥测；使用有界 worker、取消、超时与过期结果隔离，失败不覆盖源输入。
- 在线目录、搜索、双语静态说明、FAQ、SEO、sitemap 和 AI 索引接入第四个工具；延续现有品牌、主题、无 JS 说明、子路径及 preview noindex，不照搬参考站广告、会员、云端保存或桌面营销。

## Capabilities

### New Capabilities

- `web-timestamp-batch`: 时间戳逐行批量转换、混合成功/失败结果、稳定快照、资源限制与显式结果导出。
- `web-text-diff`: 本地双文本/文本文件输入、可访问差异视图、结果生命周期、资源限制以及双语目录与发现接入。

### Modified Capabilities

无主规范修改。`web-timestamp-tool`、`web-tools-shell` 目前仍位于未归档的 `usezero-web-tools-extension`，主规范尚无对应能力。本提案以两个增量能力表达新增行为，不复制或修改前一变更；其目录/搜索“三个工具”基线在本增量中扩展为四个。未来 sync/归档须按官网基础、在线工具基础、本增量的顺序协调，并消除数量约束差异。

## Impact

- 仅涉及独立 `website/`：工具注册表、Astro 工具工作区、纯 TypeScript 计算层、脚本/worker 契约、工具样式、网站测试和维护文档；不增加 React/Tauri/Rust/IPC、后端或桌面插件。
- 批量复用 `parseTimestamp`、既有格式化规则与 worker 生命周期；对比优先评估维护中的开源 `diff`（jsdiff），实施前核验维护、许可证、类型、worker 兼容和体积并锁定版本，不自研通用 diff 算法。
- 与 `usezero-web-tools-extension`、`add-zero-product-website` 衔接；不改变发行清单或桌面能力声明。新增两个索引页面，全站预期从 26 页增至 28 页；时间戳批量不另建 URL。
- 本轮交付 proposal、design、specs、tasks；功能实施、部署、提交、推送、发布、spec sync 和归档不包含在本轮。
