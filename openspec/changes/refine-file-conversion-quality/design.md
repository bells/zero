## Context

动机与产品边界见 [proposal.md](proposal.md)。本文件是待实施设计，源码调查日期为 **2026-11-03**；没有据此完成原型、设备或安装包验收。

| 当前拥有者 | 已核实基线 | 对本设计的影响 |
| --- | --- | --- |
| `src/plugins/file/engine/pdfToDocx.ts` | PDF.js 提取文字，整页无文字时才 OCR；拒绝旋转页 | 需要统一坐标与区域内容来源，而非调整一个复杂度阈值 |
| `pdfComplexity.ts` / `editableDocx.ts` | 两栏/段落启发式；writer 只有段落与图片；图片放在页内全部文字之后 | 增加有顺序的块模型和真实 Table 输出 |
| `docxToPdf.ts` / `fileEngine.css` / `native_print.rs` | 等待图像/字体，macOS 按 pageRects 截取并合并；有 `0.75` 坐标换算 | Windows 整个 DOM 打印必须使用独立布局路径 |
| `provider.rs` / `capabilities.rs` | DOCX → PDF 固定内置→LibreOffice→Word，Windows 只有外部 provider | 持久化偏好与任务绑定必须由 Rust 统一管理 |
| `services/ocr/` / File OCR bridge | File 已可调用共享 macOS Vision / Windows PaddleOCR provider，Windows 依赖受校验的本地资产 | 不重做 OCR，也不沿用旧文档“Windows 无 OCR”的结论；源码可达不等于 File 实机通过 |
| `src-tauri/file-engine-policy.json` | 候选 1.2.0 / run protocol 2；无 approved package digest，发行证据未闭合 | 源码能力、候选版本和正式工件批准分别处理 |

参考实现与上游依据见 [research.md](research.md)，逐类验收见 [acceptance.md](acceptance.md)。

## Goals / Non-Goals

**Goals:**

- 复用现有受限 WebView 引擎，将纯内容重建、系统能力和 UI 状态清楚分离；保留 Rust 权威队列与最终提交。
- 用可验证的内容覆盖、表格结构、阅读顺序和质量报告提高转换可用性，覆盖办公文档、扫描件、论文；不将“所有类别”解释为任意输入均可无损转换。
- 让内置与外部引擎的选择、能力和失败可解释；同一批次不因全局偏好变化而改变引擎。
- 用 Windows 原型尽早检验原生导出路径，将不可行结论或缺少设备证据显式暴露。

**Non-Goals:**

- 新增格式、网页端转换、Linux/mobile 支持、全局界面重设计。
- 公式→OMML、图表→原生 chart/数据、手写或化学结构识别、额外 AI 模型与 Python/.NET 推理运行时、人工校对工作台。
- Word 原始排版完全复现、所有无边框/嵌套表格、任意重叠/倾斜文本；将普通插图一律 OCR。
- 安装或分发 Office/LibreOffice、隐式云转换、运行时任意命令路径、放宽签名和包审批。

## Decisions

### 1. 沿用当前引擎，参考结构算法而非引入整套 Filee

选择 PDF.js 提取 / `docx` 写入、`docx-preview` 渲染、Rust 原生 adapter 的现有路线。Filee 的 C# 中间模型、网格表格重建和字体预检提供设计与验收参考；其 DOCX→HWPX→rhwp 路线有另一组格式损失，不作为 Zero 的整体替换方案。

替代方案：依赖用户 Office 完成全部转换，会破坏开箱使用；嵌入 Filee/.NET 或完整办公套件会引入不成比例的体积与平台成本；公式/图表识别模型已明确移出范围。通用 ZIP/XML、字体、矩阵与 OOXML 能力优先复用现有依赖或维护中的库，实施时记录版本、维护、许可和体积依据；只实现 Zero 必需的版面适配策略。

### 2. 用统一坐标的内容块重建 PDF

为每页建立可独立测试的 typed 中间模型：页尺寸/旋转变换、原始内容标识、边界框、阅读顺序，以及 `paragraph`、`table`、`figure` 块。段落含对齐/缩进/字号/字体/runs，表格含网格、单元格、rowSpan/colSpan、边框和相对列宽；figure 区分普通插图与不可编辑的公式/图表等局部图形。TS 不使用 `any`。

处理次序：

1. 有界提取文字、绘图指令、图片引用、字体与坐标；将 0/90/180/270° 页旋转统一映射到直立页空间。任意倾斜/重叠仍可明确拒绝。
2. 合并字词/行，识别可靠栏界和通栏标题；在局部区域恢复有框直线表格，校验单元格内容覆盖与合并关系；表格内部文字从普通段落流移除，避免双写。
3. 保留标题、段落、页眉页脚/页码可恢复内容；可靠的页眉页脚可落入对应结构，否则保留可见内容，不仿照参考项目直接丢弃重复内容。
4. 将普通图片、表格和段落按局部阅读顺序组合。图片的尺寸受页内可用区域与像素预算约束，不再固定缩至最高 400px 或全部追加到页末。
5. 使用 `docx` 的 Table / TableCell / Paragraph / ImageRun 输出；支持可编辑表格中的行列合并。保留原始页分隔和空白页，但不承诺 Word 重排后页数必然相同。

扫描件后续细化：保留原始 OCR 字框用于覆盖校验，独立估计输出字号；较长中文行可提供字宽参考，避免把上下留白也计入字号。对于被可辨标题划分、具有持续空白栏缝且纵向重叠的局部区域，复用无边框 Table 安置独立文字栏和局部照片。该容器仅表达版面分栏，不声称识别出扫描数据表格的单元格语义。字段逐行保持独立，正文按几何连续性和标签边界合并段落；标题前景/背景色从已渲染页有界采样。原始字体无法由扫描像素可靠确定，保留字体检查不完整和重排警告。详见后续验证记录。

规则有框、直线网格、文字层可靠的表格属于必须生成真表格的支持集；复杂无边框表格或扫描表格仅在网格可可靠恢复时生成表格，否则在文字/顺序完整的前提下警告重排。无法确定单元格内容归属时失败。不能以“有文字”代替完整性校验。

### 3. 公式、图表是明确标记的局部图片，不是图片文档回退

本次只保留可可靠定位且可完整渲染的局部图形，不识别数学结构或原始图表数据。既有图片可复用；由矢量绘制的局部图形可以通过有界 page render + clip 生成图片，不要求其原本就是 PDF Image XObject。

区域必须与普通正文/表格具有可验证边界，包含必要图例、坐标标注或公式编号；与正文重叠、范围无法确定、外观渲染失败时返回 `unsupportedInput`，不静默丢内容。原本属于该图形内部的文字归属于图片，不再作为零散段落重复写入；普通正文不得因图形检测而被吞入大幅截图。

合成验收为每个局部图形规定期望边界与前后正文。模型中的内容标识跟踪“已写入文字/表格、局部图形保留、真正空白、无法保留”四类处置，用于发现已提取内容的遗漏；这不能证明任意未知 PDF 都正确分类。未覆盖或无法确定的输入保守失败，不能声称万能公式/图表检测。

输出继续要求非空可见可编辑正文。纯图表/纯公式且没有可编辑正文的文档当前明确不支持，不用隐藏标签、虚构标题或整页图片绕过 Rust 语义检查。

### 4. 区域 OCR 复用共享服务，文字覆盖与图片归属一起判定

保留可靠文字层作为首选。对可能承载正文的扫描区域，结合图片覆盖、现有文字位置和区域布局决定是否需要 OCR；少量标题不能证明全页正文已覆盖。图形/照片不因包含少量文字而自动提升为“扫描正文”。对无法可靠区分的区域返回不支持，不能为了提高成功率忽略它。

OCR 继续走 File 的原始字节 IPC、活动 run/page/version 校验和一次性 lease，不让 File 调用 Snap。为区域识别增加受控 region 标识和裁切矩形，校验其属于已授权页，限制区域总数/像素/累计字节，拒绝越界裁切和过期结果。识别坐标必须经过裁切、缩放和页旋转的完整逆映射。

区域结果与原有文本在同一坐标空间按覆盖和内容去重；有可靠文字叠层的扫描页不再次写一份 OCR 文本，也不嵌入整页扫描背景。扫描背景只因 OCR 成功而移除时，必须单独保留可支持的插图/公式/图表区域，不能连同非文字内容一并丢掉。

沿用当前 512 页、500 万字符、120 秒文档 deadline、最高 200 DPI / 24MP / 8192 边长 / 32MiB 单页上传等已有限额；区域操作共享页/文档总预算，不能每个区域重新获得 120 秒。维持 OCR 单 worker 与逐页资源释放。长扫描件可能超时，本次不承诺 512 页都能在时限内完成。取消立即撤销提交资格，不能假称所有原生 OCR 都可即时终止。

### 5. 字体预检与质量报告相互独立于正文内容

DOCX 有界读取字体表、样式/主题引用、嵌入字体声明与所用 family；PDF 识别目标 DOCX 的 family，去除 subset 前缀，避免把 PDF 内嵌可渲染字体等同于目标编辑器可用字体。Rust 使用受限的系统字体 adapter 探测请求 family，不向展示 WebView 暴露字体文件路径；优先核查现有 CoreText / DirectWrite 绑定与维护中的字体库复用成本后选最小 adapter。

`document.fonts.ready` 只证明加载阶段结束，不能证明请求字体存在或 glyph 完整。字体检查分为已验证可用、已知替换、缺失/可能替换和检查不完整；系统或外部 provider 的实际替换无法观察时不编造 family。嵌入字体只有在当前输出路线真正支持其格式/授权/加载时才算可用。禁止自动下载字体或获取文档外链。

缺字导致正文不可读时失败；可读替换、重排可带警告完成。常规内容顺序/表格/图片验证独立执行，不能用字体警告掩盖缺页。

新增结构化 quality issue：稳定 code、可选源 pageNumbers / sectionIndexes、可选 fontFamilies、总 occurrences、truncated。代码集合覆盖 `fontMissing`、`fontSubstituted`、`fontInspectionIncomplete`、`layoutReflowed`、`tableSimplified`、`nonEditableGraphic`、`ocrUsed`、`ocrLowConfidence`、`ocrDownsampled`。每任务最多 100 条细节，同类聚合；页/字体列表也有界，保留受影响总数和截断标记。DOCX 尚未分页时使用 section，不伪造源页码。

保留旧 `warningKeys` 可读并由新报告投影必要兼容警告；结果/失败均可带 quality issues。界面本地化 code，未知 code 使用安全的通用提示；错误/报告不含正文、OCR 文本、源文件绝对路径或引擎 HTML，不进入持久化诊断。报告按任务会话存活，不增加转换历史数据库。

### 6. Rust 拥有偏好与批次绑定，UI 提供方向选择

新增 File 专属 schemaVersion=1 偏好，存于 `~/.zero/data/file/preferences.json`，仅含各方向 providerId。使用原子写入、已知枚举校验和有界读取；不写入队列、文档路径或内容。此为本设计的存储选择，不改变宿主 `zero.preferences.v1` 或既有迁移逻辑。保存失败必须反馈，不能声称“已记住”。

首次默认内置，Windows 新 provider 使用独立 `zeroFileDocxToPdfWindows` 标识，保留现有 macOS 标识和旧结果枚举。当前选择不可用时仍显示该选择和原因；不在安装/刷新时自动跳到外部引擎。未知/跨平台旧偏好安全归一为内置并显示一次性设置恢复提示；已知但当前缺失的 provider 保留为不可用选择。

开始队列时对纳入本批的全部 queued items 原子冻结各方向 providerId；所有后续 worker dispatch 只使用各任务绑定的 ID。探测/磁盘操作不持有长时间队列锁，绑定前校验偏好/能力 revision，变化则重新检查而非混用快照。某方向不可用不阻断其它方向，但该方向任务不进入可运行批次。处理中改变偏好不影响已绑定任务。

已有普通 Retry 保持原任务引擎；“使用当前选择重试”是明确动作，以带目标 providerId 的重试请求重新绑定。错误/取消是否可重试仍受原 retryable 条件和输入重验限制。不可用/权限/激活/超时等保留原因，不能因为注册表里有别的 provider 就自动换用。

主窗口放两个方向的选择控件与不可用原因；托盘只显示当前引擎和进入主窗口配置的动作。PDF→DOCX 当前只提供内置，不能因为装了 Word/LibreOffice 就伪造该方向 adapter。复用 `useFileConversion` 的 action gate、事件订阅和 busy/error，不在组件堆叠异步流程。

### 7. Rust / TypeScript IPC 的新增与兼容

以下为拟新增契约，实施时与序列化测试同步，而非已存在的 API。wire format 统一为这些类型的 camelCase，不全局重命名旧契约：

```rust
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConversionProviderSelection {
    pub direction: FileConversionDirection,
    pub provider_id: FileConversionProviderId,
}

#[tauri::command]
pub async fn set_file_conversion_provider(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    input: FileConversionProviderSelection,
) -> Result<FileConversionCapabilitySnapshot, FileConversionError>;
```

```typescript
interface FileConversionProviderSelection {
  direction: FileConversionDirection;
  providerId: FileConversionProviderId;
}

const capabilities = await invoke<FileConversionCapabilitySnapshot>(
  "set_file_conversion_provider",
  { input: selection },
);
```

- `FileConversionDirectionCapability` 增加 `preferredProviderId`；`selectedProviderId` 只表示该偏好当前可运行的 provider。`available` 根据偏好计算，不能因为其它引擎可用而显示本选择可用。
- set 返回当前 capability snapshot，并发出版本化偏好/能力更新事件供 main/tray 收敛；队列 job event 仍只描述任务。
- 扩展既有 `retry_file_conversion_job` 请求，增加可选 providerId；省略保留原 provider，提供时验证明确换引擎的方向/可用性。原 `invoke(..., { input: { jobId } })` 保持可用。
- 开始队列 command 仍可沿用现有无参数调用，返回已绑定任务快照；引擎 selection 不由 WebView 在运行途中覆盖。
- Rust/TS 的 provider enum、quality issue/error/result、engine complete 和必要 region OCR 请求成对修改；新字段默认兼容旧结果，不能让旧引擎因忽略新字段伪装新能力。
- 新设置 command 限 main/tray 宿主调用；隔离 File engine 仅保留转换/OCR 受控 IPC。调整 capability 与 command caller 检查时不得把 File engine 加入默认窗口授权。

### 8. Windows 首先做真实原型，再接入原生 adapter

当前锁定 Tauri 2.11.0 / Wry 0.55.0 / `webview2-com` 0.38.2 已有平台 controller 访问与 PrintToPdf 接口，见 [research.md](research.md)。Windows adapter 应选择同版本 Windows 专属直接依赖，避免与现有 `windows` 0.52 COM 类型混用。

优先候选：隐藏 `docx-preview` WebView → 资源就绪 → UI STA 线程取得 WebView2 → 探测打印接口/配置 → **Rust 私有 staging 文件** → 有界 PDF 校验 → 现有无覆盖提交。`PrintToPdf` 可能覆盖传入路径，因此绝不可直接传用户最终路径。流接口可作为替代，但要证明流大小和生命周期受限。

WebView2 对整个 DOM 按 print CSS 分页，不提供 macOS pageRects 式裁切。为 Windows 建立独立打印 CSS 和参数，显式设置纸张、边距、缩放、背景、关闭浏览器自带页眉页脚，保留文档自己的页眉页脚；不能复用 macOS `zoom:0.75` 和坐标乘数。统一输出模型将页面几何与像素/point换算分开。

原型必须验证 `.visible(false)` 的真实资源加载/布局、A4/Letter、横竖混排、长表和首启。混合 section 几何若单次打印不能正确保留，可以在同一 adapter 下按已测 section 打印并用经许可核查的轻量 PDF 工具合并；不可用时按规范拒绝该输入，不能静默改成全篇 Letter。合并依赖不得未经体积/许可测量进入发布工件。

每实例只允许一个打印操作。COM 回调不阻塞 UI，受 run generation / job token 校验；取消/超时先撤销提交权，原生不可立即取消时等待有界结束或销毁并替换 engine，隔离迟到回调及 staging。旧操作未结束不能把同实例交给下一任务。

真实 Windows 原型未通过时保留 capability 不可用，记录失败/待验；Windows 工作不能因此标为完成。若技术路线在必要语料上无法成立，应显式报告阻碍并调整提案，不以外部 Office 路线偷换“内置 Windows 导出”的目标。

### 9. 验收按输出内容与证据类别划分

执行 [acceptance.md](acceptance.md) 的矩阵。合成 PDF/DOCX 的正文、顺序、单元格、合并、图形、几何和错误均有稳定预期。先复用现有生成器/测试设施，禁止用源码字符串断言替代真实输出验收。

DOCX 解包检查正文、`w:tbl`、合并、图片关系，并使用兼容编辑器编辑、保存、重开；PDF 检查字节/页数/尺寸/可搜索文字和视觉裁切/重叠。结构校验、内容覆盖和视觉验收各司其职，任何一个通过都不等于其它通过。Office 兼容引擎仅在实际安装/授权条件下分别验收，不自动安装它们。

保留工程门禁 `pnpm test`、`pnpm build`、Cargo fmt/check/test、构建图独立快照、strict OpenSpec、`git diff --check`。运行变化需要 `pnpm tauri dev` 原生流程；macOS、Windows、兼容编辑器、签名安装包分别记录版本和状态，无法执行的设备任务保持 unchecked。

## Risks / Trade-offs

- [PDF 不含原始文档结构] → 对有框表格/可靠两栏定义支持集，使用内容处置与输出语料证明；不将启发式分数等同正确性。
- [局部图形裁切误吞正文或漏标注] → 比较边界与内容归属，限制截图区域，未知失败；独立验收矢量图和扫描图中的图形。
- [区域 OCR 误判、重复或慢] → 同坐标覆盖去重、共享总预算、逐页释放；普通照片不盲目 OCR，超时不提交部分文档。
- [字体探测无法知道 Word/LibreOffice 的最终替换] → 报告已知事实与检查不完整，不承诺字体匹配；人工比对受影响语料。
- [WebView2 打印重排与隐藏窗口差异] → 原型为首个实现关卡；纸张/混排/取消必须真实 Windows 验证，源码编译不能代替。
- [持久偏好与批次发生竞态] → Rust revision 快照、批次冻结、晚到事件拒绝，测试跨窗口和重启。
- [新引擎与旧结果/已安装包混淆] → 新版本能力绑定、旧 metadata 兼容读、候选不批准；无当前格式承诺的旧包不能申领新能力。

## Migration Plan

1. 先建立基线语料、Windows 原型和依赖证据；保留原型结论，不能提前广告新 provider。
2. 在插件边界内实现中间模型/结构与 OCR/字体/质量报告，再接入偏好、UI 和 Windows adapter；任务按可独立验收阶段拆分。
3. 对 Rust/TS、协议、资产清单、许可及引擎候选同步版本化。不得沿用旧版本号冒充新表格/局部图形/选择能力。候选 version 在实施时按兼容变更决定，具体 digest 只来自最终精确工件。
4. 更新 File 维护文档中的 Windows OCR、表格/图形边界和默认路由；中英文 README 如涉及产品声明同步修改。现有文档未实现的能力不能因本提案提前写成已交付。
5. 更新后的候选仍不批准；签名包、平台、体积/内存/ready/取消、离线安装和回滚证据单列。回滚保留用户输出；新偏好遇旧程序不应引发任意程序调用，重新选择可恢复。

### 与活跃 delta 的衔接及未来同步顺序

| 旧变更/能力 | 本次新增或替代的约定 | 后续显式 sync 时处理 |
| --- | --- | --- |
| `add-file-plugin` / `local-file-conversion`, `file-conversion-workflow` | 默认内置、显式方向选择与换引擎，不自动挑任意可用引擎 | 保留原 validation/queue/commit 场景标识，完整修订 provider 选择与 unavailable 场景 |
| `bundle-zero-file-offline-engines` / `zero-file-offline-engines` | 继续废止整页 facsimile；新增有条件 Windows 内置 exporter | 先带入底层契约，再合并后续 editable/OCR/本次要求；禁止恢复历史图片回退 |
| `refine-zero-file-editable-conversion` / `editable-pdf-to-docx` | 支持集有框表格必须真表格；局部图形不代表整页图片回退 | 保留 `Supported two-column text or text table` 等标识，完整改写正文与 scenarios，而非删掉旧行为保障 |
| `enhance-snap-and-share-offline-ocr` / `file-scanned-pdf-ocr` | 扩展同页区域、旋转、插图保留；共享 OCR 平台按当前 provider 探测 | 保留 printed/mixed/no-provider/cancel 场景；旧“同页扫描不支持”由本次受限区域支持取代，不扩大 Snap 权限 |

这些旧变更仍未归档，本次 specs 使用新的补充 capability 路径，并以本表说明本次实现范围内的冲突优先级。未来若用户要求同步，应先处理上述依赖，再把冲突 requirement 的完整版本与既有 scenario 标识一并协调；本次不改旧 delta、主规范或历史 evidence。

## Open Questions

无待用户决定的产品范围。实施期需要通过原型回答：Windows 隐藏打印/混合纸张是否达标、字体 adapter 的最小依赖选择，以及支持集中的区域分割阈值。这些是验证与实现关卡，不能被当作已经通过，也不能自行扩大为模型识别、静默回退或发行审批。
