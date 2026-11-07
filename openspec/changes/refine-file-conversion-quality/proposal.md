## Why

Zero File 已能完成 PDF ↔ DOCX 转换，但 PDF 的表格被线性化、插图集中放在页内文字之后，DOCX 导出缺少字体缺失预检和主动引擎选择，影响办公文档、扫描件和论文的可用性。本次参考 Filee 已实现的结构重建与字体检查，在现有本地引擎架构中改善可编辑结果及跨平台导出，并固定“不静默丢内容”的验收边界。

## What Changes

- PDF → DOCX 恢复正文、标题、段落属性、可靠双栏阅读顺序、规则有框表格及合并单元格，并按内容顺序安置插图；复杂无边框表格仅在内容完整、顺序可确定时允许重排并警告，不承诺逐像素版式。
- 完善现有离线 OCR：支持可归正的旋转页、同页文字与扫描正文区域合并，避免重复识别原有文字或将正文扫描误当普通插图跳过。
- 公式、图表不做原生对象或数据重建。能够可靠确定范围并保留内容时输出独立局部图片、提示不可编辑；无法可靠保留内容时失败。正文与支持的表格仍可编辑，不恢复整页图片 DOCX 回退。
- 增加缺失字体预检、替换警告与分页/跨页内容验收；DOCX → PDF 保持内置离线导出，同时允许按方向主动选择已安装的 Word / LibreOffice。
- 按方向记忆引擎选择，默认内置；选择在任务进入运行前冻结，失败、卸载或权限拒绝均不静默换引擎，由用户明确选择后重试。
- 验证并实现 Windows WebView2 原生 PDF 导出，不要求安装 Office 或另带浏览器运行时；真实 Windows 原型和运行时能力探测是启用该能力的前置条件。
- **BREAKING（结果与默认路由）**：已检测到正文遗漏、必需扫描区域未识别、无法确定阅读顺序或无法保留的图形内容时不再允许“带警告的部分成功”；未选过引擎的方向默认内置，即使安装了兼容引擎，也不因内置不可用而自动切换。旧结果仍可读取，不追溯改写。

## Capabilities

### New Capabilities

- `file-structured-pdf-to-docx`: 可编辑正文、真实表格、图文顺序、旋转/混合扫描及局部图形保留的支持边界。
- `file-conversion-provider-selection`: 按方向选择、持久化、任务绑定、显式换引擎重试和不可用状态。
- `file-docx-to-pdf-quality`: macOS / Windows 内置导出、分页与资源就绪、原生打印生命周期和平台能力门禁。
- `file-conversion-quality-reporting`: 字体预检、结构化质量反馈、禁止虚假部分成功、合成语料及编辑/设备验收。

### Modified Capabilities

无。当前 `openspec/specs/` 仅有 `main-window-shell` 与 `caffeine-duration`，File 能力仍在未归档变更中。本次新建补充规范，并在设计中明确相对旧 delta 的优先级，不假称修改不存在的主规范。

## Impact

- 前端/引擎：`src/plugins/file/` 的面板、hook、service、contracts、i18n，以及 PDF 中间模型、DOCX writer、DOCX DOM 渲染与平台打印样式。保持托盘紧凑、主窗口完整；不重设计宿主导航或增加格式。
- 原生：`src-tauri/src/services/file/`、相关 commands/capabilities、File 偏好存储、原生字体探测与 Windows WebView2 adapter；OCR 复用宿主共享服务，不使 File 导入 Snap。
- IPC：新增对称的引擎选择与分页质量反馈契约、Windows provider 标识；Rust 继续拥有任务状态、路径、文件提交、租约、取消和输出校验。
- 依赖：优先复用锁定的 PDF.js / `docx` / `docx-preview`、Tauri 和系统 WebView；Windows adapter 使用与锁文件匹配的 WebView2 绑定。不引入 Filee 的 .NET/HWPX/rhwp 栈、公式/图表模型、Python 推理运行时、云转换或人工校对工作台。
- 依赖变更：衔接 `add-file-plugin`、`bundle-zero-file-offline-engines`、`refine-zero-file-editable-conversion` 和 `enhance-snap-and-share-offline-ocr`；后续 sync 必须先调和旧图片回退、表格降级、整页 OCR 与平台描述，保留既有 scenario 标识。本次不勾选旧任务、同步或归档。
- 验证与发行：建立办公文档/扫描件/论文的合成输出验收，分别记录 macOS、Windows 与签名安装包证据。更新源码和候选能力不能自动批准引擎工件，现有 policy、签名和体积门禁保持有效。
