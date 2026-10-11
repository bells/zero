## Context

动机见 [proposal.md](proposal.md)。2026-10-11 源码核对结果：

- `src/plugins/file/metadata.json` 只贡献 main view。设置中心按 `statusBarItems` 判断能力；Rust `status_bar_contributions()` 却在字段缺失时调用 `default_status_bar_item()`，使用 `Extension` 四宫格和 `OpenPlugin`，造成两端不一致。
- File descriptor 加载同一个 `FilePanel`，当前 `BundledPluginPanelProps` 仅有 language。面板同时绑定原生拖放和选择器，两个窗口共用“拖到这里”。原生 `choose_file_conversion_inputs` 已有 `DialogGuard`，无需放宽 tray 失焦隐藏。
- `pdfComplexity.ts` 将稀疏文字、旋转、重叠、多栏和多矢量操作统一导向 `layoutPreserving`。`pdfToDocx.ts` 对整个文档决策，任意一页触发就全篇图片化；文字生成异常也被捕获后进入同一路径。
- 现有文字重建只按坐标归并行与 `TextRun`，尚无稳定的段落/分栏/空格恢复。引擎错误联合缺少已有外层 `ocrRequired`，且引擎入口除密码/取消外均映射 `providerFailed`。
- 已有 PDF.js 6.2.108、docx 9.7.1 和测试用 JSZip 3.10.1。现有 rich-layout、scan 语料的预期正是图片 DOCX，因此不能把旧测试通过作为可编辑证据。

## Goals / Non-Goals

**Goals:**

- 在现有宿主/插件/引擎边界内纠正入口资格和按 surface 展示的 intake；不增加 File ID 特判。
- 以可编辑正文、文字完整性和可理解的阅读顺序作为 PDF → DOCX 成功条件；版式只是尽力恢复。
- 让无法转换的输入与失败保持可诊断、可恢复，并保留逐页资源边界及 Rust 权威状态。

**Non-Goals:**

- OCR、密码输入、逐像素排版、复杂表格结构和原生公式/图表重建；也不增加“图片 DOCX”模式或模式选择器。
- 安装 Python/Office、云转换、引擎审批、第三方插件贡献迁移、DOCX → PDF 重写、Windows 新 exporter。

## Decisions

### 1. 内置贡献显式化，保持已安装扩展兼容

在宿主贡献归一化中依据已有 `PluginSource::Bundled` 区分：内置工具缺失或空 `statusBarItems` 时返回空贡献，已声明且受支持的项继续走现有过滤与排序。已安装扩展保留现有缺省策略，避免本次 File 优化变成公共协议迁移。

不只设置 File 默认不可见，也不靠写入用户 `status-bar.json` 隐藏它；这些做法仍会留下不存在的能力，并允许旧偏好重新显示。旧 `zero.file: true` 不产生入口；可沿用现有归一化清理无效项，但不改其他工具偏好。资格变化同时作用于 macOS 合成图标、Windows 面板直接动作、预览、tooltip/highlight/click 区域。File 普通导航和系统搜索入口不依赖原生状态栏贡献。

### 2. 宿主提供 surface 上下文，File 自己决定 intake 表达

扩展共享的内置面板 props 为显式 `surface: "tray" | "main"`，由宿主渲染链传递，File descriptor 转交给面板。它是前端上下文，不是新增 IPC，不通过 CSS 或窗口名称猜测文案。其它面板可以忽略该信息，继续懒加载。

| 位置 | 主文案 | 提示 | 操作 |
| --- | --- | --- | --- |
| tray | 选择 PDF 或 DOCX 文件 | 支持多选；添加后可检查目标格式 | 原生文件多选 |
| main | 拖入或选择 PDF / DOCX 文件 | 支持拖放和多选；添加后可检查目标格式 | 原生拖放和文件多选 |

提供对应英文。tray 不绑定主窗口拖放激活提示；将入口视为普通可聚焦按钮。main 保留拖入反馈。复用现有 choose/inspect/enqueue 逻辑和共享 Rust 队列；对话框取消不视作错误、不添加任务。DialogGuard 仅保护已打开的原生对话框，普通外部失焦仍隐藏托盘。

现有 Rust 边界继续使用：

```rust
#[tauri::command]
pub async fn choose_file_conversion_inputs(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Vec<FileConversionCandidate>, FileConversionError>
```

前端 service 保持 `invoke<FileConversionCandidate[]>("choose_file_conversion_inputs")`，由现有 controller 封装 busy/error，不在组件增加嵌套异步路径。

### 3. 先恢复正文，复杂度决定重排与警告，不决定图片化

#### WPS 公开资料校准（2026-10-11）

- [金山办公《2025 年年度报告》](https://pdf.dfcfw.com/pdf/H2_AN202603251820748895_1.pdf) 第 25 页“面向数据交互的文档转换技术”说明其 PDF 转 Word 使用传统方法与深度学习，并包含图像处理、OCR、分栏/表格识别和重新排版，将页面元素变成可编辑文档。这支持借鉴“提取内容 → 识别结构 → 重建流式文档”的技术分层；公开描述未提供本项目可以直接集成的转换源码或 SDK，也不能证明某一客户端版本的实际精度。
- [WPS 扫描 PDF 转 Word 功能说明](https://www.wps.com/feature/convert-scanned-pdf-to-word/) 展示先 OCR 再导出可编辑段落的工作流，并提示低清/歪斜扫描仍需校对。OCR 是识别图片文字的必要步骤，不是把图片换一个容器。
- [旧金山 PDF 转 Word 页面](https://vip.wps.cn/pdf2word/) 明示该独立软件不具备 OCR，与当前套件说明不同。竞品验收必须记录版本、平台、入口和 OCR 设置，不能将不同产品代际混为一谈，也不能据此推定所有 WPS 转换都离线。

Zero 本次借鉴可编辑内容优先、分栏/段落分析与可验证输出，不承诺复刻 WPS 的完整精度。支持真实 Word 表格和扫描 OCR 是独立后续能力，本次的表格文字线性化会清楚提示。如果本机已有合适 WPS，可用同一组合成文件作对照，分别记录文字编辑、阅读顺序、表格结构和图像保留；无竞品实测时只记录公开来源，不宣称 Zero 已达到 WPS 品质，不上传用户文档进行对照。

保留 PDF.js 解析和 docx OOXML 写入；实现前复核这两个已锁定上游的 text/image/paragraph API、发布与许可。它们提供成熟原语，Zero 只负责 PDF 布局到文字流的适配策略。引入其它库必须先说明现有依赖不能满足什么，并记录体积/许可/维护依据。

逐页获得文字、坐标、字体和基本图像信息，抽离可独立验证的中间模型与阅读顺序逻辑。基本恢复流程：过滤无意义空字符，识别真正空白页、短文本页与无文字层图像页；按基线归并词/行，利用间距恢复英文空格而不在人为拆开的中文字符间插空格；识别可靠的列边界，按列再按段落输出，保留页面分隔。无法确定顺序或文字映射时返回 `unsupportedInput`，不能因为有少量文字就报告全篇成功。

单栏正文、短文本、中英文、多页和可判定的双栏必须得到正文 `Paragraph`/`TextRun`。有可提取文字的表格可以转换为按行组织的可编辑文本并提示结构/版式变化，不承诺 Word 原生表格。旋转、重叠等无法可靠恢复时明确失败。真正空白页保留分页，不触发 OCR，也不能让整份空白文档被标成可编辑成功。图像仍是图像；基本插图可在支持范围内保留，无法恢复的图形或图片内文字明确提示，不能用整页截图替代可提取正文。

无文字层的非空扫描页返回 `ocrRequired`；混合文档含此类页时整个任务失败，避免丢失这些页而提交不完整文档。取消、超时和生成失败传播类型化错误，移除 `createLayoutDocx` 自动回退调用。仅减小旧复杂度阈值或在页面图片上叠隐藏文字都不满足本方案。

### 4. 成功结果有语义校验，错误贯穿引擎与 UI

内置 provider 的新结果仅使用 `editableReconstruction`，保留已有 profile enum 以读取旧结果和兼容其它 provider，但不再向当前内置 PDF provider 广告 `layoutPreserving`。

引擎 `FileEngineCompletionRequest.errorCode`、对应 Rust 反序列化/校验和 UI 映射同时支持 `ocrRequired`、`unsupportedInput`。保留 `passwordRequired`、`cancelled`、`timeout`、`providerFailed` 等已有类别；异常诊断只包含有界安全信息，不把提取文字或源路径写入日志。

复用 `file_engine_complete` 完成协议（调用保持 `invoke<void>("file_engine_complete", { request })`），由 `status: "failed"` + `errorCode` 表达失败。Rust 的原始输出写入/最终提交边界保留，提交前对新内置 PDF 输出增加有界 OOXML 语义校验：`word/document.xml` 必须含非空可见正文文字，拒绝全图片、空文本、只在不可见文字/属性/批注中塞内容的结果。校验不能仅凭引擎上报 profile；ZIP 展开量、XML 大小和解析深度保持有界。全面文字覆盖与阅读顺序由引擎/语料验收证明，不宣称 Rust 的最低语义门禁等同于完整保真验证。

用户预先看到“PDF → DOCX 生成可编辑文字，复杂版式可能调整；扫描件需要 OCR”，成功结果展示可编辑重建警告；失败不提交最终文件。扫描件提示移除现有“可改用版式保真结果”建议，本次没有这个产品入口。

### 5. 版本与签名能力一致

新旧引擎不能只靠 profile 名称区分：实施时递增引擎版本并同步共享版本/资产 manifest/许可清单与候选 metadata。宿主只向满足本契约的有效版本广告编辑能力，并拒绝旧引擎的图片完成消息。若选中的签名包尚不满足要求，方向报告引擎升级/不可用，不让旧包冒充新能力；开发 fallback 保持 debug-only。

重新生成源码引擎测试资产不代表发布审批。更新候选版本和测量输入后仍保留 `approved: false`；摘要绑定、签名、语料、离线打包与每平台门禁完成后，才在未来获准发布流程中批准精确工件。

## Risks / Trade-offs

- [复杂排版会发生重排] → 在转换前后给出双语说明，以可编辑文字完整性优先；不可恢复内容显式失败。
- [本次扫描件不能转换] → 明确 `ocrRequired`，后续 OCR 必须独立评估语言包、离线体积和资源成本；不制造图片成功。
- [新规则增加可见失败] → 错误分类区分文档限制与运行失败，保留重试/取消、批次继续和源文件保护。
- [分栏、英文空格、CJK 及嵌图恢复有误] → 用合成语料验证文字覆盖、阅读顺序、分页和警告；无法满足支持语料时不能以源码契约测试替代真实输出。
- [整页处理造成内存膨胀或取消延迟] → 逐页释放 PDF/图像资源，对内容/页面/ZIP 设置上限，沿用既有超时、token 和清理；不把原文带回展示 WebView。
- [签名旧包仍输出图片] → 版本兼容及完成语义校验双重阻断，保留引擎修复/升级状态，审批策略不自动放行。

## Migration Plan

1. 实施三个规范与对应任务，运行合成输出测试、Rust/前端门禁及独立构建图检查。
2. 更新语料 expected 及 generator，使 rich-layout 不再期待图片结果，scan/mixed 期待 OCR 错误；只使用生成数据，不读取或提交用户文档。
3. 在 macOS 原生开发流程验证状态栏、托盘选择器、主窗口拖放、转换、打开/编辑/保存，并单列 Windows 和签名包待验项。
4. 更新引擎维护文档，标明本变更替代旧 facsimile/fallback 行为；旧 evidence 保持日期语义。规范尚未同步：将来同步/归档 `add-file-plugin`、`bundle-zero-file-offline-engines` 时先按依赖处理，再将其冲突 requirement/scenario 全文改成当前规则并保留场景标识，防止同时留下互斥要求。本次不归档/同步它们。
5. 如需回滚，回滚本次源码/候选版本；保留已完成的用户输出与偏好。回滚旧行为需要明确版本说明，不能仍显示本版本的可编辑承诺。
