# Snap Direct Manipulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if the user selects delegated execution. Steps use checkbox (`- [ ]`) syntax for tracking. This document defines implementation details; [tasks.md](tasks.md) is the authoritative completion checklist. Do not implement as part of proposal creation.

**Goal:** 让 macOS Snap 六类标注无需切换 Select 即可直接移动、分类型缩放和重新编辑。

**Architecture:** 复用现有前端场景、原图几何、单对象事务和共享输出。纯命中/变换与输入目标仲裁从 DOM 编排中分离；当前绘图工具与选中属性对象独立，Rust/IPC 不扩展。

**Tech Stack:** React 19、TypeScript 5.8、Canvas 2D、现有 Tauri 2、Node 测试与现有 Playwright 浏览器 fixture；无新运行时依赖。

**Spec:** [design.md](design.md)、[行为规格](specs/snap-direct-annotation-manipulation/spec.md)、[proposal.md](proposal.md)。

## Global Constraints

- 范围仅限 macOS、已有矩形/椭圆/箭头/画笔/文字/马赛克和本次截图会话。
- 不新增 Rust command、IPC 字段、capability、对象持久化或运行时依赖。
- 禁止 TypeScript `any`，读取外部值使用 `unknown`；保持插件隔离、默认值白名单、原图 OCR 与 raw media/lease 提交流程。
- 主体 6 CSS px 附加容差；控制点 8 CSS px 命中半径；形状最小尺寸 4 源像素；文字字号 12–96 源像素，复用现有常量。
- 使用 `pnpm@10.33.0` 和优先 Node 24+；fixture 准备、共享资产构建和浏览器脚本串行；不提交生成物或改历史证据。
- 保留 source bounds、ID、z-order、线宽、opacity、pixelSize；只允许已有矩形 radius 合法化。一次有效完成一次历史，取消/no-op 不破坏 redo。

## Review Focus

- 点击空心图形内部/斜线路径间空白应能继续画或选择下层，不再被 bounding box 拦截；Task 1 的多形状和跨缩放 fixture 固定此行为。
- 对象/crop 控制点重叠或 Option 在途中变化不应换成另一种操作；Task 3 的真实指针回归固定目标优先级与手势身份。
- 中英粗体多行文字和整数边界下四角缩放不得改行、漂移固定角或提前触发 IME；Task 2 测量单测与 Task 3 文本交互分别验证。
- 选中类型与当前绘图工具不同时面板不得改错默认值；Task 3 的跨类型属性和后续绘制/storage 断言验证。
- 新入口取消、失捕、工具切换或输出时不能泄漏草稿、重复历史或旧马赛克像素；Task 4 的历史/PNG fixture 验证。

## File Structure

路径均相对于仓库根。现有 geometry 模块承载纯命中和变换，新增 `src/plugins/screenshot/capture/captureAnnotationInteraction.ts` 只承载优先级决策。`CaptureApp.tsx` 只接入事件/状态；不拆 unrelated UI，也不新建平行 renderer。单测新增 `tests/unit/plugins/screenshot/captureAnnotationInteraction.test.mjs`；其余扩展既有 annotation/selection/Canvas/export 单测与浏览器脚本。新增纯模块加入 `scripts/prepare-test-fixtures.mjs` 的显式编译列表，防止仅在 Vite 中可用。

### Task 1: 精确命中与目标仲裁

**Files:** Modify `src/plugins/screenshot/capture/captureAnnotationGeometry.ts`, `captureSelectionModel.ts` (same directory), `scripts/prepare-test-fixtures.mjs`, `tests/unit/plugins/screenshot/captureAnnotationEditing.test.mjs`, `captureSelectionModel.test.mjs` (same test directory). Create `src/plugins/screenshot/capture/captureAnnotationInteraction.ts`, `tests/unit/plugins/screenshot/captureAnnotationInteraction.test.mjs`.

**Interfaces:**
- Geometry exports `AnnotationHitContext { image: Size; viewport: Size; toleranceCssPx?: number }`; `hitTestAnnotation(annotations: readonly AnnotationObject[], point: Point, context: AnnotationHitContext): DrawingAnnotation | null`. 默认 `toleranceCssPx = 6`，忽略 Pin，所有生产调用者显式传 context。
- 新模块 exports `AnnotationPointerInput { annotations: readonly AnnotationObject[]; selected: DrawingAnnotation | null; point: Point; context: AnnotationHitContext; cropHandle: SelectionResizeHandle | null; bypassObjectBody: boolean }`。
- `resolveAnnotationPointerTarget(input: AnnotationPointerInput): AnnotationPointerTarget`；union 为 `{kind:"object-handle"; annotation:DrawingAnnotation; handle:ObjectHandle} | {kind:"crop-handle"; handle:SelectionResizeHandle} | {kind:"object"; annotation:DrawingAnnotation} | {kind:"blank"}`。
- 调用方仅在 Select 传 cropHandle，完整选择区可用且非 OCR-only 时才调用对象路由；控件/草稿先在 UI 层消费。Select helper 与 hover 改传相同 context，避免保留隐含源像素阈值。

- [ ] 1.1 新增命名测试 `outline interiors pass through while strokes remain selectable`：大 outline 矩形中心 `(150,150)` 返回 null，边线 `(100,150)` 返回对象；在其下有实心对象时中心返回下层对象。覆盖圆角外空白、细长椭圆、实心内部、双箭头头部、Pen 单点/折线路径间空白和低 opacity。缩放 1 与 0.5 下，距细线 5 CSS px 命中、7 CSS px 不命中。
- [ ] 1.2 增加 `object handles precede crop handles and Option skips only bodies`：重叠时返回 object-handle；无对象 handle 则 crop-handle；Option body 返回 blank，Option handle 仍返回 handle。运行 `pnpm test:unit`，记录新增断言因旧包围框/缺新模块失败，而不是环境错误。
- [ ] 1.3 实现上述签名、形状距离与纯仲裁；更新所有旧 hitTest/Select helper 调用和 fixture 编译清单。角度、圆角和箭头路径复用现有 renderer 几何，文本共用 `textLayout`；bounds 只作预筛选。
- [ ] 1.4 运行 `pnpm test:unit`，预期全部通过且每条新增断言执行。检查 `rg -n 'hitTestAnnotation|resolveSelectPointerTarget|resolveSelectionPointerMode' src/plugins/screenshot/capture tests` 的每个调用者均使用一致语义。

### Task 2: 比例和文字缩放

**Files:** Modify `src/plugins/screenshot/capture/captureAnnotationGeometry.ts`, `tests/unit/plugins/screenshot/captureAnnotationEditing.test.mjs`; only if required update shared text-layout use in `captureCanvas.ts` without introducing a second layout implementation.

**Interfaces:**
- 沿用 `annotationHandles(annotation: DrawingAnnotation): {handle:ObjectHandle;point:Point}[]`，Text 返回四角，其他对象按 design。
- 增加 `AnnotationResizeOptions { preserveAspectRatio: boolean }`；扩展 `resizeAnnotation<T extends DrawingAnnotation>(annotation:T, handle:ObjectHandle, delta:Point, image:Size, options?:AnnotationResizeOptions):T`。形状默认自由，Pen/Text 始终等比；原调用兼容，UI 每帧传 Shift。
- 沿用 `moveAnnotation`、`moveArrowEndpoint`、`textLayout`、`PROPERTY_RANGES`，没有新 IPC 或对象字段。

- [ ] 2.1 新增 `shape Shift resize preserves original ratio at image limits`，使用 80×40 矩形和角/边 handles，断言 ratio=2、固定对角/对边中点、宽高>=4、在源图内、ID/style 不变。追加 Shift 开关始终从同一初始对象计算的断言。运行 `pnpm test:unit` 记录旧 resize 不支持比例的失败。
- [ ] 2.2 增加 `Pen scaling is uniform and degenerate axes remain finite`：普通路径宽高比例不变、strokeWidth 不变，横/竖路径零轴仍零、全零单点返回等价原对象；替换旧任意拉伸预期但保留边界/no-NaN 检查。
- [ ] 2.3 增加 `Text corner resize retains opposite measured anchor and manual lines`：四个角、中文/English/粗体/多行，断言字号整数且12<=fontSize<=96、text/bold/line count 不变，最终测量对角位置在取整后的坐标精度内不变；靠左放大固定右下角时在最后合法字号停止，x/基线 y 不越界且不能通过位置 clamp 漂移固定角；合法锚点下字形溢出仍可裁切。上/下限与无变化返回不制造历史。
- [ ] 2.4 实现比例统一约束、退化轴和文字字号/基线重算，运行 `pnpm test:unit` 通过。文字 DOM 真字体测量精度由 Task 3 浏览器补验，不能只用字符数 fallback 宣称字体布局通过。

### Task 3: 跨工具编辑接入与可发现提示

**Files:** Modify `src/plugins/screenshot/capture/CaptureApp.tsx`, `src/plugins/screenshot/capture/captureSelectionModel.ts`, `src/plugins/screenshot/capture/i18n.ts`, `src/App.css`, `tests/browser/snap-annotation.mjs`, `tests/browser/snap-floating-panels.mjs`, `tests/fixtures/snap/annotation-editor.html` as needed; add `tests/browser/snap-direct-manipulation.mjs` for the new flow regressions. Review `captureHotkeys.ts` and existing source-contract tests only for rules affected by the change.

**Interfaces:** Consume Task 1 `resolveAnnotationPointerTarget` and Task 2 `resizeAnnotation`; existing `startObjectGesture`/controller `begin-preview-commit-cancel` remain the owners. `propertyObject` derives from selected ID and excludes Pin, without active-tool type filtering. `selectedObject` derives independently of Select. Add `bypassObjectBody:boolean` to newly started drawing gesture state only where needed; Option source is `event.altKey` at pointerdown, Shift source is each pointermove `event.shiftKey`.

- [ ] 3.1 Add browser cases `new annotation exposes handles without Select`, `cross-tool properties do not alter next drawing defaults`, `outline interior starts a new drawing`。在现有 fixture 中绘制/拖动真实 canvas，断言对象数量/坐标、工具 aria 状态、面板 region 和后续对象属性；先在启动的本地 Vite 上运行 `node tests/browser/snap-annotation.mjs` 观察旧实现失败。
- [ ] 3.2 接入对象选择、几何、hover、跨类型面板和工具重选；对象 handles 与 crop DOM handle 都交给同一优先级，避免事件穿透/stopPropagation 改写结果。加入实心图形/马赛克 Option 起笔、途中释放 Option、不带 Option 后按 Option不转模式、Option control 不穿透和重叠 handles 测试。
- [ ] 3.3 扩展 Text 双击到各绘图工具；测试两次 click/dblclick 不先创建其他对象，Option 双击不改旧文字、活动草稿外部点击不多启手势、Enter 换行/Cmd+Enter提交/Escape取消/空白删除/composition 优先。测试真 Canvas 文字测量与四角缩放锚点。
- [ ] 3.4 增加紧凑中英 Option/Shift 提示和对象/控制点光标；测试六工具持续绘制、选中不同类型时面板锚到类型按钮、360px 窄视口/各边缘滚动/可见焦点。运行 `node tests/browser/snap-annotation.mjs`、`node tests/browser/snap-floating-panels.mjs`、`node tests/browser/snap-properties-layout.mjs` 串行通过。

### Task 4: 事务、输出与模式保护

**Files:** Modify `tests/unit/plugins/screenshot/captureAnnotationEditing.test.mjs`, `captureCanvas.test.mjs`, `captureExport.test.mjs`, `tests/browser/snap-annotation.mjs`, `tests/browser/snap-annotation-pixels.mjs`, relevant existing source-contract fixtures. Change `captureAnnotationEditing.ts`/hook/reducer/renderer only if a new regression proves a real production gap; do not refactor working ownership.

**Interfaces:** Existing controller `begin(annotation,kind):number`, `preview(token,annotation):void`, `commit(token,annotations):CaptureAction|null`, `cancel():void` and raw prepare/upload contract remain unchanged. Use existing fixture `snapInvocations`, `snapUploadBytes` and canvas readback to inspect actual outcomes.

- [ ] 4.1 增加跨工具 `many previews commit one edit; cancelled/no-op edits retain redo`，以及 pointercancel、lost capture、Escape、工具切换+迟到 pointerup。断言一次 Undo 恢复原对象，一次 Redo 恢复最终值；取消不改原对象、默认值或 redo。
- [ ] 4.2 PNG fixture 覆盖 Text 四角字号、半透明箭头/笔迹、Mosaic 移动后对**新区域**前序场景像素化、pixelSize 保持；输出不含手柄/提示、裁剪透明圆角保留，Copy/Save/Pin 使用同一已提交 scene，编辑中不发送草稿 upload。
- [ ] 4.3 用 `?ocr-only`、初始无 crop、Select 空白移动/外部重建验证隔离，检查 OCR 参数只含原会话与源选区；storage 中不出现文字/几何/对象ID/token。运行 `pnpm test` 与 `node tests/browser/snap-annotation-pixels.mjs`，预期全部通过。

### Task 5: 集成门禁与维护说明

**Files:** Modify `src/plugins/screenshot/capture/README.md`; create `openspec/changes/refine-snap-direct-manipulation/evidence/implementation.md` during implementation, not during planning. Update this change's checkboxes only for completed verified work.

**Interfaces:** No new production interfaces. Consume Tasks 1–4 completed behavior and record current actual evidence, retaining old device gates separately.

- [ ] 5.1 串行运行 `pnpm test`、`pnpm build`、`node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph-direct-manipulation.json`，预期退出0且无预算失败/其他插件 eager 引入。
- [ ] 5.2 `pnpm dev --host 127.0.0.1` 启动服务后，使用已有 Playwright/Chrome（需要时按 capture README 设置 `SNAP_PLAYWRIGHT_MODULE`/`SNAP_CHROME_PATH`），串行运行 `node tests/browser/snap-annotation.mjs`、`snap-annotation-pixels.mjs`、`snap-floating-panels.mjs`、`snap-properties-layout.mjs`、`snap-startup.mjs`、`snap-windows-ocr-selection.mjs`（每个文件均在 `tests/browser/` 下）；预期退出0且无未处理页面错误。这里是合成 native IPC 的真实浏览器，非设备证据。
- [ ] 5.3 运行 AGENTS 的 Rust fmt/check/test、`openspec validate --all --strict`、`git diff --check`，预期退出0。首次 sandbox 失败保留，按实际授权做针对性/串行复测，不弱化断言。不要为本轮额外构建网站或 feedback。
- [ ] 5.4 更新 README 的 Select-only、命中、文字缩放、Pen比例与快捷提示说明；evidence 记录日期/命令/退出码/已测范围/设备限制与后继规范关系。逐个验证本地链接和未授权文件未改。提交/推送/发布/同步/归档不属于当前授权。

### Task 6: 原生验收

**Files:** `evidence/implementation.md` 和经实际验证的 `tasks.md` 状态；无新增功能范围。

**Interfaces:** `pnpm tauri dev` 下的真实 macOS capture/IME/native Copy/Save/Pin/OCR，不以浏览器 mock 替代。

- [ ] 6.1 实际操作六工具及交叉类型、Option/Shift、比例边界、空心内部连续绘制、对象/crop控制点重叠和裁剪；观察每次手势只操作一个目标、Undo/Redo/Escape 正确。
- [ ] 6.2 在可用 Retina/多屏、四角/小选区上验证对齐、光标、提示、文字四角、中文输入和原生颜色框；记录硬件/系统/覆盖，不可用组合保持未完成。
- [ ] 6.3 实际导出/钉图并检查 PNG、原图 OCR、新会话对象清理与工具默认值隔离；记录高分辨率复杂 Pen 的拖动流畅度及结束后资源回落。无法取得的测量明确列限制，不补造数字。

## Execution Handoff

维护者已在本聊天授权实施，采用当前 agent 顺序执行并在结尾独立审阅的方式。实际完成状态以 tasks.md 和 evidence/implementation.md 为准，计划中的步骤用于执行说明而非第二份完成清单。维护者随后已授权提交、合并 main 并推送；发布、规范同步和归档仍按独立授权执行。
