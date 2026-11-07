# Source research and implementation boundaries

核对日期：2026-11-03。本记录来自只读源码调查，**未运行 Filee 安装包、未执行同样本竞品转换，也未完成 Zero Windows 原型**。引用用于说明可借鉴的能力，不证明两者实际转换质量的高低。

实施前基线固定为 `6068c69e9f4bc3dd49df462d650bcde0ddf039f0`；当前工作树会随实施改变。[源码与旧 delta 复核](evidence/baseline-source.md)、[依赖决策](evidence/dependency-decision.md) 记录版本、许可与未测平台/体积边界。以下 current baseline 描述指该提交，后续实现结果应查独立 evidence，不把旧描述当作当前能力证明。

## Zero current baseline

- [PDF conversion](../../../src/plugins/file/engine/pdfToDocx.ts)：整页无文本时 OCR；有文本层的扫描正文区域可能被跳过；非零 page rotation 直接拒绝。
- [Editable writer](../../../src/plugins/file/engine/editableDocx.ts)：按 PDF 页建立 section，固定 36pt 边距，段落后统一间距，图片追加到本页文字后；尚无 Table 输出。
- [Reconstruction helpers](../../../src/plugins/file/engine/pdfComplexity.ts)：基线/段落/两栏启发式，不是完整表格网格识别。
- [DOCX render](../../../src/plugins/file/engine/docxToPdf.ts)、[print CSS](../../../src/plugins/file/engine/fileEngine.css)、[native print](../../../src-tauri/src/services/file/native_print.rs)：图片/字体等待和 macOS 页捕获已存在；Windows 分支尚不支持原生导出。
- [Provider registry](../../../src-tauri/src/services/file/provider.rs)、[capabilities](../../../src-tauri/src/services/file/capabilities.rs)：固定优先级，不是持久化的用户方向选择；PDF→DOCX 当前只选择内置 provider。
- [File OCR bridge](../../../src-tauri/src/services/file/engine_bridge/ocr.rs)、[shared provider](../../../src-tauri/src/services/ocr/mod.rs)、[Windows adapter](../../../src-tauri/src/services/ocr/windows.rs)：Windows 共享 PaddleOCR 已有实现，File 可达，须校验本地模型/DLL 与实机效果。不要复制旧 File guide 的“Windows 无 OCR”描述。
- [Engine policy](../../../src-tauri/file-engine-policy.json)：已批准工件列表为空；候选仍未批准。Release asset 20MiB 压缩 / 45MiB 安装预算、精确工件签名和测量门禁不由本提案放宽。

## Filee reference

固定提交：[31438ee8d36151c1f256a98695aa20a093fdee7a](https://github.com/KnifeLemon/Filee/commit/31438ee8d36151c1f256a98695aa20a093fdee7a)。

| 观察 | 可复核源码 | 适用结论 |
| --- | --- | --- |
| PDF 使用定位文字、绘图路径和图片重建模型 | [PdfDocumentReader.cs](https://github.com/KnifeLemon/Filee/blob/31438ee8d36151c1f256a98695aa20a093fdee7a/src/Filee.Engines/Pdf/PdfDocumentReader.cs#L1) | 可借鉴内容建模，不应把能解析 PDF 等同保留全部图形 |
| 段落、双栏阅读顺序 | [Layout.cs](https://github.com/KnifeLemon/Filee/blob/31438ee8d36151c1f256a98695aa20a093fdee7a/src/Filee.Engines/Pdf/PdfDocumentReader.Layout.cs#L174) | 建立确定阅读顺序的语料，而非只检查总文字数 |
| 有框表格网格、合并与样式 | [Tables.cs](https://github.com/KnifeLemon/Filee/blob/31438ee8d36151c1f256a98695aa20a093fdee7a/src/Filee.Engines/Pdf/PdfDocumentReader.Tables.cs#L210) | 借鉴真实 Table 输出的范围与结构验收；不外推到所有无边框/扫描表格 |
| 缺失字体和近似替代预检 | [DocumentFonts.cs](https://github.com/KnifeLemon/Filee/blob/31438ee8d36151c1f256a98695aa20a093fdee7a/src/Filee.Engines/Office/DocumentFonts.cs#L13) | 预检与最终渲染分开；不能将度量相近称为像素相同 |
| DOCX→内部模型→HWPX→rhwp | [DocumentReaders.cs](https://github.com/KnifeLemon/Filee/blob/31438ee8d36151c1f256a98695aa20a093fdee7a/src/Filee.Engines/Hwp/Hwpx/DocumentReaders.cs#L29)、[HwpxConverter.cs](https://github.com/KnifeLemon/Filee/blob/31438ee8d36151c1f256a98695aa20a093fdee7a/src/Filee.Engines/Hwp/Hwpx/HwpxConverter.cs#L45)、[RhwpConverter.cs](https://github.com/KnifeLemon/Filee/blob/31438ee8d36151c1f256a98695aa20a093fdee7a/src/Filee.Engines/Hwp/RhwpConverter.cs#L86) | 不照搬：存在中间格式损失、复杂文字 shaping 和性能边界 |
| 读取 DOCX 现有公式，不代表 PDF→OMML | [DocxReader.cs](https://github.com/KnifeLemon/Filee/blob/31438ee8d36151c1f256a98695aa20a093fdee7a/src/Filee.Engines/Hwp/Hwpx/Docx/DocxReader.cs#L671)、[DocxWriter.Body.cs](https://github.com/KnifeLemon/Filee/blob/31438ee8d36151c1f256a98695aa20a093fdee7a/src/Filee.Engines/Hwp/Hwpx/Docx/DocxWriter.Body.cs#L327) | 原生公式/原生图表恢复不在参考项目已有 PDF→DOCX 能力内，本次不实现 |
| 输出结构和阅读顺序有结果测试 | [PdfReaderTests.cs](https://github.com/KnifeLemon/Filee/blob/31438ee8d36151c1f256a98695aa20a093fdee7a/tests/Filee.Engines.Tests/PdfReaderTests.cs#L69) | 采用真实 OOXML/文字序列验收，不能声称 Zero 尚无既有输出测试 |

Filee 自身没有完整保留全部矢量图。Zero 的局部公式/图表图片保留来自本次已确认的产品边界，并非 Filee 全部具备的现成功能。它只要求有界渲染与区域判定，不引入原生公式/图表识别或模型。

Filee 顶层为 MIT，具体移植代码仍需保留其版权和许可；上游依赖须逐项复核，不能把整个依赖图视为 MIT。本次不复制其 C# 代码或引入其运行时；实施期如移植非平凡算法，应在对应 notices 中记录实际来源及许可。

## Windows export feasibility

当前 [Cargo lock](../../../src-tauri/Cargo.lock) 包含 Tauri 2.11.0、Wry 0.55.0、webview2-com 0.38.2。平台访问与 COM 绑定存在仅说明有实现路径，不证明隐藏 WebView 或分页质量已通过。

- [Microsoft PrintToPdf API](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_7?view=webview2-1.0.3912.50)：对传入路径导出，必须只使用 staging；运行时查询支持的 interface。
- [PrintToPdfStream API](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_16?view=webview2-1.0.3719.77)：替代的流输出方案，仍需有界读取和资源生命周期管理。
- [PrintSettings](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2printsettings?view=webview2-1.0.3912.50)：纸张、边距、缩放、背景及浏览器页眉页脚须显式配置。
- [Threading model](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/threading-model)：UI STA 访问和回调不得同步阻塞等待。

本次设计选择先做 Windows 隐藏导出原型，再接 provider。文档版本中的 API 描述不能代替当前设备的 QueryInterface/打印实验；Office 兼容路径不能被当作此原型已通过的证明。
