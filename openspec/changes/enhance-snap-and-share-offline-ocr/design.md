## Context

动机见 [proposal.md](proposal.md)。2026-10-11 实时源码核对：

- `SnapMenuApp.tsx` 只有 Screenshot 一行、绿色卡片和硬编码 `⌘⇧A`；`services/snap_menu.rs` 创建 252×92 WebView。Awake 右键在 `status_bar.rs::tool_status_bar_menu` 用 Tauri `MenuBuilder` / 原生菜单。
- `CaptureApp.tsx` 在 select 工具命中标注后，其余画布一律开始 create；已有 pointer capture、resize draft、键盘 nudge 可以复用。
- `open_capture_window` 对旧 `capture` 调用 `close_surface` 后立即用相同 label build，没有确认 label 已释放；`close_surface` 调用 `window.close()`。截图 4 证明重复 label，源码支持异步清理风险，但尚未实际复现并确证唯一根因。
- 截图准备调用 `screencapture`，编辑窗口与候选枚举各自默认 primary monitor。双屏/混合 DPI 的目标没有同源冻结，不可仅通过修复 duplicate label 就宣称坐标正确。
- File 的 `pdfToDocx.ts` 已逐页提取文字、重建段落、写 DOCX；`pdfComplexity.ts` 对无文字且有图像页抛 `ocrRequired`。File engine 有独立 WebView、token/job/deadline 和 narrow bridge，候选引擎仍未批准。

## Goals / Non-Goals

**Goals:** 共用宿主 OCR provider 和安全边界；Snap 与 File 各自保留插件业务 adapter；使扫描页文字真实可编辑，并对识别误差、版式变化与 provider 缺失反馈准确。修复 capture 标签和显示器一致性，而非通过增加随机 label 隐藏竞态。

**Non-Goals:** 跨屏拼接截图、Windows 自定义截图层、File 状态栏图标、DOCX → PDF 重写、扫描文字完美还原、真实表格/公式/手写恢复、云 OCR、持久 OCR 历史、用户文档语料、签名包审批。首期 OCR 实现范围为 macOS，Windows/Linux 返回能力不可用，普通 Windows 文本 PDF 转换与系统截图保留。

## Decisions

### 1. 原生 Snap 菜单与 Awake 共用 host 样式机制

macOS 左/右键 Snap glyph 都通过共享原生 popup helper，准确锚定被点击 cell，显示“截图 / Screenshot”“截图 OCR / Screenshot OCR”、分隔线及现有含义明确的“退出 Zero 状态栏”项。保持应用退出与工具动作的区别，不借用 Awake 的停止语义。截图快捷键从当前已注册偏好生成；OCR 首期不注册新全局快捷键，避免抢占现有键位。无 OCR provider 时菜单项禁用，main 显示原因。菜单关闭、Escape、选中动作及失败必须清理按工具 ID 的高亮。

Snap 菜单动作进入截图协调器前先完成原生菜单 dismissal 和 peer transient surface 隐藏，使菜单不进入冻结截图。主窗口丰富操作仍归 ScreenshotPanel。失败用已有宿主 rfd/本地化反馈与安全诊断码，不依赖已关闭菜单展示原始异常。保留旧 `start_snap_menu_screenshot` 为受限兼容入口至内部调用迁移结束；同步清理懒路由、capability、tool-window map、blur/highlight 钩子与 source-contract 测试中的废弃 `snap-menu`，不扩大 default capability。

备选：只将绿色卡片改成灰色列表仍无法稳定获得 Awake 的系统菜单外观、键盘与屏幕边界行为，且增加一套焦点生命周期，因此选择现有原生组件。

### 2. 单会话状态机与同源显示器快照

Rust 在现有 Snap lifecycle gate 内管理 `idle → preparing → awaitingReveal → editing → closing → idle`，OCR handoff 从 editing 分离到有界 OCR job。用户再次触发：preparing 返回同一待启动结果、awaitingReveal 不提前显示、editing 聚焦已有编辑器、不更改旧 action/显示器；closing 只合并一个待启动请求，确认旧窗口 Destroyed/注册 label 消失后才开始。未确认销毁时返回可重试关闭失败，不继续同名 build。

保留固定 `capture` label。销毁 callback、reveal timer、commit/cancel 和 cleanup 都绑定 session generation；旧回调只能清理自己的 media/lease，不可清除或关闭新会话窗口。避免在 AppKit 主线程等待 Destroyed；用协调状态/通知驱动，不在 lifecycle gate 内等待需要同一 gate 的回调。关闭/销毁失败有可见错误和恢复路径；插件停用、退出及过期撤销权限、清理 temporary media。

Rust 一次确定 `CaptureDisplaySnapshot`：native display ID、全局逻辑 frame、Tauri physical frame、截图像素 width/height 和实测每轴比例。原生菜单入口用 glyph 所在 display；快捷键/main 入口用调用瞬间 cursor display，获取不到时回退 primary 并记录安全原因。捕获显式绑定该 native display；优先评估维护中的既有 `xcap` monitor 能力或 CoreGraphics display API，若继续 `screencapture -D` 必须验证 native display ID 到 CLI index 的映射及输出文件，不能假定它们等价。仅保留本次目标屏文件，不捕获所有屏幕副产物。

窗口、候选枚举、截图 media 都使用此快照。overlay 覆盖完整 screen.frame（包括菜单栏/Dock），而 popup 菜单使用 work area；不要混用。CoreGraphics/AppKit/Tauri 原点及单位在 Rust 统一转换，TS 接收明确的 camelCase `display` 描述并在 source-image 像素做选区计算。依据实际图像/viewport 比例，不套 primary scaleFactor。热插拔或 frame 变化使准备快照失效，安全取消/重试；编辑中的冻结图像保持坐标稳定。继续隐藏准备、媒体解码和 DOM commit 后幂等 reveal。

备选：多屏同时 overlay 与跨屏拼接会引入 per-screen session、焦点和混合 DPI 合成，超出本轮；随机窗口 label 会掩盖过期 session 与权限范围问题。

### 3. 手掌拖动是选区平移，不移动已创建标注

select 工具命中优先级：geometry input/toolbar → resize handle → annotation → selection interior → outside。内部空白显示 `grab`，pointer down 保存 initial selection 和 source point，移动显示 `grabbing`，用绝对 delta 计算并 clamp，宽高/radius 保持。边界 clamp 不累积误差，反向移动立即可响应。draft 同时驱动遮罩、尺寸和 toolbar；pointer up 提交，cancel/lost capture/Escape 恢复 initial。Escape 在手势中仅撤销手势，第二次才按现有会话退出行为处理。

标注保留源图坐标，选区移动只改变裁剪窗口，标注 history 不新增 entry；resize/arrow nudge 采用同一原则。选区外仍可重画；非 select 工具维持绘制光标与行为。触控 pointer 可拖动，桌面采用浏览器标准 grab/grabbing 光标，避免增加自定义 cursor 资产。

### 4. OCR provider 属于原生宿主，结果不仅是一串字符串

2026-10-11 上游核对：

| 来源 | 采用方式与边界 |
| --- | --- |
| [Umi-OCR README](https://github.com/hiroi-sora/Umi-OCR/blob/main/README.md) / [仓库](https://github.com/hiroi-sora/Umi-OCR) | MIT、约 4.8 万 stars、未 archived；借鉴离线截图识别和文本块流程。现有 Python/Qt 运行包面向 Windows/Linux，不能作为 macOS 直接依赖。仓库 pushed_at 为 2025-11-20，star 数不代替近期维护判断。 |
| [Apple Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images) / [objc2-vision](https://docs.rs/objc2-vision/latest/objc2_vision/struct.VNRecognizeTextRequest.html) | 首期使用系统文字识别，经维护中的 objc2 binding 集成；实际支持语言按 request revision/OS 查询。Vision 观察框转换为源像素左上角坐标，保留 confidence。 |
| [Windows.Media.Ocr 官方文档](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr?view=winrt-26100) | desktop 支持依赖 package identity，不能假定普通 Tauri installer 可用。首期只实现不可用反馈；后续可评估 Windows provider 或 Rapid/Paddle sidecar 的模型、许可、包体与签名。 |

选择 macOS `VNRecognizeTextRequest` accurate path，首期目标为印刷中英文；不从 UI language 推导文档语言。provider 探测系统支持语言，显式语言不支持则返回 `languageUnavailable`。通过最小 features 和锁定版本接入既有 objc2 生态，不自行写识别算法。保留 provider interface，未来增加 Windows 后两插件无需重新设计业务。

共享 `services/ocr/` 只接收已授权的 owned bitmap，不读取任意路径；产生 `OcrPageResult { width, height, lines, warnings }`，每个 line 含 text、像素 bounds、confidence。文本重排属于插件 adapter 的需求：Snap 形成可读文本，File 映射 PDF point 和段落；不让宿主 service 导入插件前端，也不让 Snap 与 File 导入彼此。错误使用 `Result<_, OcrError>`，camelCase enum 包含 `unsupportedPlatform`、`providerUnavailable`、`languageUnavailable`、`invalidInput`、`resourceLimit`、`busy`、`timeout`、`cancelled`、`recognitionFailed`。

初始资源限额：全局 1 个识别 worker，最多 2 个等待请求（Snap/File 公平轮转，File 一次只占一页）；单图 PNG ≤32 MiB，≤24 MP、单边≤8192，结果≤10000 lines / 1 MiB UTF-8，单页≤30 秒，且不得超过父 job deadline。File 继承页数/输出/字符限制，不默认延长当前 120 秒整文档 deadline；长文档超时如实失败。输入 admission 先检头和像素预算再 decode。provider 运行 off UI，取消/超时立即撤销结果提交资格并调用可用的 native cancellation；若原生 worker 尚未返回，它继续占 slot，不释放名额制造后台任务洪泛。等待请求超时从入队开始计算。

输入、结果和租约不写持久日志/历史；诊断只能含批准的 plugin/phase/provider/outcome/计数，不含文本、截图、路径或 token。共享服务不得用一个通用“读取文件/截图/OCR 任意路径”的命令暴露给 WebView。

### 5. 两个受限 adapter 与对称 IPC

以下为规划接口，实施时以序列化测试锁定 Rust/TS，旧 screenshot snake_case response 不批量改名。

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRect { pub x: f64, pub y: f64, pub width: f64, pub height: f64 }
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSnapOcrInput {
    pub session_id: String,
    pub selection: OcrRect,
    pub languages: Vec<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine { pub text: String, pub bounds: OcrRect, pub confidence: f64 }
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrPageResult {
    pub width: u32, pub height: u32,
    pub lines: Vec<OcrLine>, pub warnings: Vec<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrJobHandle { pub job_id: String }
#[tauri::command]
pub async fn start_snap_ocr(
    window: tauri::WebviewWindow, app: tauri::AppHandle, input: StartSnapOcrInput,
) -> Result<OcrJobHandle, OcrError>;
```

```ts
interface OcrRect { x: number; y: number; width: number; height: number }
interface StartSnapOcrInput { sessionId: string; selection: OcrRect; languages: string[] }
interface OcrLine { text: string; bounds: OcrRect; confidence: number }
interface OcrPageResult { width: number; height: number; lines: OcrLine[]; warnings: string[] }
interface OcrJobHandle { jobId: string }
const handle = await invoke<OcrJobHandle>("start_snap_ocr", { input });
```

Snap：仅 active `capture` 可以 start，以 sessionId + rect 对 Rust 冻结 media 进行裁剪，不上传屏幕全图、不识别 toolbar/标注。裁剪必须校验有限数、整数化规则、区域非空/不越界。用户的马赛克等标注不影响原图识别，编辑器按钮 accessible hint 明确“识别选区原始文字”；不自动把识别结果送出本机。ocr intent 经独立 typed capture intent 表示，不能让旧 normalize action 静默退回 copy。OCR 截图进入复用编辑器，选择后显式确认识别。

Rust 建立短期 job，截取所需 crop 后释放 capture session/lease/media、关闭 overlay，打开 main 的 Snap 结果视图。失败关闭不得隐藏恢复错误；OCR worker 与 capture teardown 分离。main 只可读/取消自己的 Snap result，tray/capture/File engine/installed runtime 不可任意取其他 job。结果 snapshot 保留一个最新 job、带 revision，无文本 event payload；main 收到失效事件后读取。处理 StrictMode、晚到旧结果、close/reopen、工具切换及取消；结果只在内存中保留至清除/新任务/停用/退出，最长 10 分钟。main 关闭撤销正在运行的 Snap job；结果显示后先编辑，点击 Copy 才由 Rust 写文本剪贴板。

File：`zero-file-engine` 只能通过 File adapter 调用 `prepare_file_page_ocr`，Rust 验证 run token、jobId、engine version、PDF→DOCX 方向、pageNumber 和 parent deadline，发放 5 秒一次性 page lease。`upload_file_page_ocr` 使用原始 PNG body + lease headers，Rust 校验期望 width/height、页范围、单页请求次数、payload 限额；拒绝重放与跨 job。结果只返回该引擎 run；失效 run 即使 worker 完成也不得写回/完成任务。capability 保持独立，新增命令仍做精确 caller 检查。

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePageOcrInput {
    pub token: String, pub job_id: String, pub engine_version: String,
    pub page_number: u32, pub width: u32, pub height: u32,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePageOcrLease { pub lease_token: String, pub expires_at_ms: u64 }
#[tauri::command]
pub async fn prepare_file_page_ocr(
    window: tauri::WebviewWindow, app: tauri::AppHandle, input: FilePageOcrInput,
) -> Result<FilePageOcrLease, OcrError>;
#[tauri::command]
pub async fn upload_file_page_ocr(
    window: tauri::WebviewWindow, app: tauri::AppHandle, request: tauri::ipc::Request<'_>,
) -> Result<OcrPageResult, OcrError>;
```

```ts
interface FilePageOcrInput {
  token: string; jobId: string; engineVersion: string;
  pageNumber: number; width: number; height: number;
}
interface FilePageOcrLease { leaseToken: string; expiresAtMs: number }
const lease = await invoke<FilePageOcrLease>("prepare_file_page_ocr", { input: pageInput });
const result = await invoke<OcrPageResult>("upload_file_page_ocr", pngBytes, {
  headers: { "x-zero-file-ocr-lease": lease.leaseToken },
});
```

File 的 bridge wrapper 注入 `recognizePage` callback 给纯 converter，测试用受控 provider，但真实输出验收必须再跑真实 OCR；原文不返回 tray/main。Rust 内部共用 service，两个插件不互相引用。这比安装两个 OCR runtime 或把 File engine 加到截图权限范围更可维护。

### 6. PDF 页面选择 OCR，再重建 DOCX

流程：`PDF.js → 页面分类 → 原文字或页面 raster → OCR blocks → PDF point 文本中间模型 → 现有阅读顺序/段落 → docx → Rust 可编辑输出验证`。

- 有可靠文本层：继续提取文字；不因为图像/字数少而整页 OCR，避免重复识别已有正文。有文本但插图含文字属于当前图片范围限制，明确警告，不宣称提取完整插图文字。
- 真正空白页：保留分页，不 OCR。无文字层且有绘制内容的疑似扫描页：以有界 200 DPI raster（超预算下采样并提示）校验非空，非空执行 OCR；有 image op 不代表非空白，防止把白底扫描页误报未识别。
- 混合 PDF：按页合并；首期不对“同一页文本层 + 局部扫描区”自动做 OCR 去重，保留明确限制。无法可靠恢复的损坏文本映射/旋转排版仍 `unsupportedInput`，不把任意异常都重试 OCR。
- OCR 坐标先按实际 raster viewport 变换（cropBox、rotation）转为 PDF point，原点统一；首期保留现有旋转页限制，不虚假开放未验收版面。OCR line 映射到 `PdfTextSample`，字体近似默认值，不根据识别结果编造 bold/italic。有效正文后进入现有重排 writer，扫描背景不再作为整页图片加入 DOCX。
- 支持语料：清晰横排印刷中英文单栏、混合文本/扫描多页、普通空白页与扫描空白页；可靠两栏可重排并提示。表格以可编辑文字重排、真实表格结构后续另提案。难以恢复的阅读顺序拒绝或明确限制，不静默丢字。
- 非空页 OCR 无文字或发生关键失败：整 job 失败，无最终文件；缺 provider/语言能力返回 `ocrRequired` 并给出平台原因；timeout/cancel/resource failure 保留自身结构化类别。正常成功保留 `editableReconstruction`，增加 `ocrUsed` / 低置信/布局简化 warnings，用户可校对后保存。

File 的能力描述必须拆开“引擎 ready”与“host OCR provider 可用”；新 run 协议携带 host-issued OCR capability 和预算。协议/候选引擎版本递增，旧引擎不获得 OCR lease。新增错误和 progress stage `recognizing` 在 Rust/TS/localization 对称映射。只更新候选 manifest/协议，不批准 engine policy；签名包若未匹配新协议则要求升级。

## Risks / Trade-offs

- [Vision 语言/系统差异] → runtime probe、确定性合成语料和真实 provider smoke；无支持语言禁用，不承诺所有 macOS 中英文效果。
- [原生 close 尚未释放 label] → generation 状态机、销毁确认和超时恢复，覆盖重复启动/立即重启/失败重试；不在主线程等事件。
- [负坐标与 DPI 混用] → 同源 native display snapshot，实测截图像素比例；左右/上下/1x+2x/hotplug 设备证据逐项记录。
- [OCR timeout 后 native worker 仍运行] → 撤销提交权但保持 worker slot，等待请求有界，不能以 cancelled 状态冒充资源已回收。
- [扫描识别不等价完整排版还原] → 以可编辑正文验收、明确结构简化/校对 warning，真实表格和公式另行设计。
- [跨插件权限或 run token 泄露] → 两个窄 adapter、opaque job/lease、单次上传/重放测试、无内容诊断。
- [PDF raster 内存/长文档超时] → 逐页释放、像素/字节/整文档上限、继承 deadline；不默认无限延长或并发整本文档。
- [新引擎源码有效但发布包仍旧] → 新版本 ready handshake 与 host capability 双门禁，debug fallback 与精确签名工件 evidence 分列。

## Migration Plan

1. 保留其它活跃变更，先做 capture 重入/显示器与菜单切换，再完成选区平移；补齐真实双屏 evidence 后才能宣称截图 4 被修复。
2. 引入 shared provider、窄接口和 limits，完成 Snap OCR；随后接 File lease bridge、页面分类/adapter/协议升级和真实输出检查。
3. 仅用合成数据运行前端/Rust/OpenSpec/build-graph 门禁和 native smoke；正文实际编辑保存、Windows、离线签名包分列。此规划的任务保持未勾选。
4. 后续获授权同步/归档时，按旧 Snap/File 基础 capability → 本次 capability 的顺序整理冲突要求，保留既有场景标识，不同步互斥的“仅卡片菜单”“选区内部新建”“扫描永远失败”规则。当前仅在本变更记录替代关系。
5. 回滚可分别关闭 OCR capability/退回旧 adapter 和菜单；撤销新 leases、清理 owned staging、保留用户源文件/已完成输出/偏好。不降级或改写用户文档，不更改 bundle identifier 或审批策略。

## Implementation notes — 2026-10-11

- Vision uses the system's default recognition revision with accurate language probing, rather than pinning a newer revision unsupported by older systems. The text-recognition class is checked before construction; no global macOS deployment target was raised. Only the current macOS runtime has been verified.
- Scheduling is Tokio FIFO with one native worker and two waiting admissions; File awaits each page before submitting another. Cancellation/deadline revokes publication, while unfinished Vision work retains both permits. This adapter does not invoke `VNRequest.cancel`; native cancellation remains a future adapter improvement. This narrows the native-cancellation detail above without changing the resource-bound spec.
- Capture starts coalesce through one shared flight. Destroy/restart waits for the fixed label to leave the registry on a background thread, with a two-second bound and generation-scoped callbacks. Menu dispatch allows 100 ms for the native menu/compositor to dismiss; this is an implementation assumption awaiting actual menu tracking/frame acceptance.
- Snap crop currently validates/decode-bounds the entire source screenshot before cropping, so a source larger than 24 MP or an edge larger than 8192 is refused even if the chosen crop is small. File pages downsample within those limits and warn.
- Hidden PDF.js rasterization uses print intent. Exact signed File assets remain unapproved; debug source-engine evidence and incomplete interactive/device gates are recorded in `evidence/verification.md`.
