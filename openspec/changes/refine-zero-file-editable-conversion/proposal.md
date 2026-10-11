## Why

Zero File 当前没有声明状态栏贡献，宿主却为它生成了四宫格通用入口，与偏好设置中的能力说明不一致；托盘又用拖入文案引导一个容易因失焦中断的操作。PDF → DOCX 在复杂排版或重建失败时输出整页图片，满足了文件格式转换，却没有满足用户继续修改文档的目的。

## What Changes

- 内置工具的状态栏入口以显式 `statusBarItems` 贡献为准。File 不声明该能力，因此不生成其通用图标；保留 File 在托盘工具导航、主窗口和系统搜索中的入口。
- 托盘 File 入口改为“选择 PDF 或 DOCX 文件”，通过现有原生多选对话框添加文件；主窗口保留“拖入或选择”及原生拖放。保留托盘正常失焦隐藏与对话框保护。
- **BREAKING（输出行为）**：内置 PDF → DOCX 以可编辑文本重建为唯一成功结果，不再自动回退到整页图片 DOCX。复杂排版优先转换为可读、可编辑的段落，允许版式变化并明确提示；无法可靠恢复内容时返回结构化错误。
- 无文字层的扫描页提示需要 OCR，不输出伪装成可编辑文档的图片结果。本次不引入 OCR、云服务或额外运行时安装。
- 同步质量能力、引擎错误、双语提示、合成测试语料和输出验收；保留本地处理、Rust 队列、取消、输出不覆盖和签名包审批边界。

## Capabilities

### New Capabilities

- `bundled-status-bar-eligibility`: 内置工具的原生状态栏、快捷动作回退与设置能力保持一致，不为无贡献工具制造入口。
- `file-intake-by-surface`: 托盘以文件选择器为主要入口，主窗口支持拖放与选择，窗口切换不改变原生队列。
- `editable-pdf-to-docx`: 内置 PDF → DOCX 输出可编辑文字；规定复杂文本、扫描件、混合文档、失败与内容验收行为。

以上是后续约束的新规范路径。相关旧能力尚位于未归档变更中，不能假称其已存在于主规范。

### Modified Capabilities

无。当前主规范仅有 `main-window-shell` 与 `caffeine-duration`，本次不改动其要求。

## Impact

- 原生状态栏：`services/status_bar.rs` 中缺省 `Extension` 贡献是截图一对应四宫格的源码来源；只收紧内置工具贡献资格，不改变已安装扩展的现有兼容策略，也不增加 File 专用宿主分支。
- 前端：`FilePanel.tsx`、File descriptor/i18n 与宿主面板上下文；复用现有原生选择器及 `tray_panel::DialogGuard`，不增加独立 File 窗口。
- 转换：`engine/pdfToDocx.ts`、`pdfComplexity.ts`、引擎完成消息、Rust bridge/provider 的质量声明与结果校验。复用锁定的 PDF.js / `docx`，实现期核对上游 API 与维护/许可状况。
- 依赖关系：明确替代 `bundle-zero-file-offline-engines` 中扫描件 facsimile 与质量失败回退的旧行为，细化 `add-file-plugin` 的托盘/主窗口 intake；兼容 `refine-tray-and-workspace-navigation` 的失焦和布局机制、`refine-launch-and-system-search` 的 File 搜索入口。保留旧变更和历史证据，实施时注明哪些验收预期已被本提案取代。
- 平台：内置 PDF → DOCX 范围仍为 macOS/Windows；DOCX → PDF 平台范围和实现保持现有约定。Windows 实机与签名包验收单列，不以 macOS 或构建结果替代。
- 验证：生成无用户数据的 PDF，检查 DOCX 内实际文字、阅读顺序、分页和编辑后保存；同时回归无 File 状态栏图标、托盘多选/取消/失焦以及主窗口拖放。提案校验与运行时验证分别记录；不批准、发布或归档引擎包。
