## Context

动机和确认范围见 [proposal.md](proposal.md)，完整行为见本变更的三份 delta specs。当前代码有以下与方案直接相关的约束：

- `captureTypes.ts` 已以联合类型表示六种绘图标注，`PinAnnotation` 实际是立即提交的区域动作；标注不作为结构化对象通过 IPC 交给 Rust，提交的是合成 PNG。
- `CaptureApp.tsx` 同时组织会话、绘制、选区、文字输入、历史和工具栏，新增交互需要局部拆分，避免继续堆积事件分支。
- `captureReducer.ts` 已有 add/replace/remove/undo/redo，但 replace 每次入栈。直接把 slider input/pointer move 交给 replace 会产生过多历史。
- `captureCanvas.ts` 的绘制由预览和 `captureExport.ts` 共用；预览重画从冻结 base image 开始，马赛克采样它之前已经合成的场景。现有文字包围盒用字符数估算，粗体和中英文混排需要统一测量。
- `captureToolbarModel.ts` 与几何/坐标模型已经存在；选区内部拖动、尺寸/裁剪圆角、目标选择和原始像素 OCR 由其他未归档变更定义。
- 依赖已包含 React、Canvas 浏览器能力和 lucide 图标，没有画布场景引擎或通用色彩面板库。主偏好沿用 `zero.preferences.v1`，捕获 WebView 当前没有独立无痕配置。

## Goals / Non-Goals

**Goals:**

- 在 Snap 插件内建立类型化的属性、默认值、单对象交互与编辑事务边界，使 UI、预览和导出共享相同规范化数据。
- 保持源图片像素为唯一几何基准；对象控制点/输入布局使用视口坐标，不把显示器比例固化进属性。
- 最大程度复用现有 renderer/reducer/geometry/IPC，以有界临时资源支持整体不透明度和完整撤销。

**Non-Goals:**

- 不把 Zero 改成通用矢量编辑器，不引入可保存/重新打开的场景文档，不改变 Rust 截图媒体/租约/提交接口。
- 不扩大截图平台、采集显示器范围或 OCR 内容语义，不重写宿主偏好、原生会话或其他插件。
- 不借本次实现关闭旧变更的多屏、首帧、签名包或发布门禁。

## Decisions

### 1. 用插件内属性模型扩展现有对象，保留明确的类型边界

新增纯 TS 属性模型（建议 `captureAnnotationProperties.ts`），集中提供按工具区分的属性接口、初值、可编辑字段、输入验证及对象属性 patch。类型使用 discriminated unions，不使用 `any` 或无约束的任意键写入。

- 有颜色的标注增加 `opacity`（内部 0.01–1）；界面/存储使用整数百分比，并统一换算。
- Rectangle/Ellipse 增加 `fillMode: "outline" | "solid"`，Rectangle 独有 `cornerRadius`；Arrow 增加 `heads: "single" | "double"`；Text 增加 `bold`。Mosaic 的可编辑样式只有 `pixelSize`，不从通用透明度字段派生。
- 原有对象构造/测试 fixture 缺少新字段时，通过统一归一化入口得到 opacity=1、outline、radius=0、single、regular，不允许预览与导出各自猜默认值。实现时迁移所有受影响的类型化构造点。
- 用独立的绘图工具类型排除 select/pin；Pin 不进入可编辑对象模型，已有动作继续使用原路径。
- 半径上限为 `min(100, floor(min(width, height) / 2))`。绘图默认值保存用户请求的 0–100，创建/缩小对象只约束该对象实际半径，不反写工具默认值。实心保留线宽值但只填充边界内，切回空心后恢复该线宽。

替代方案：把所有属性都塞进公共基类，或对任意对象用通用键值表修改。二者都会允许马赛克带透明度、文字带圆角等非法状态；按工具收窄的模型更容易验证。

### 2. 保留轻量 Canvas 2D，通用控件优先用现有平台能力

现有 React 与 Canvas 已覆盖领域交互，默认使用原生 range/number/color、checkbox/button 与现有图标完成属性控件。预设色板包含红、橙、黄、现有绿、青、蓝、紫、白、黑；custom color 采用不含 alpha 的规范化 `#RRGGBB`，透明度由单独属性控制。

实施前对比既有依赖与维护中的通用组件/画布方案，记录功能缺口、许可证、维护状态及初始包体影响。有明确缺口时复用合适库；没有缺口时不增加 npm 依赖。原生输入不是重新实现通用 slider/color picker。

替代方案：迁移 Konva/Fabric 等整个场景引擎，或为本次简单控件加入大型 UI 套件。它们可用于更复杂的图层编辑，但当前迁移会改变马赛克、导出、命中和包体边界，超出六种现有工具增强的收益。

### 3. 明确 drawing-default 与 selected-object 两种面板上下文

面板（建议 `AnnotationPropertiesPanel.tsx`）只接收已收窄的上下文、数值和事件回调：

- drawing-default：绘图工具激活且未选中对象时显示该工具默认值，修改仅影响下一笔。完成绘制后保留当前工具与新对象 selectedId，面板立即显示新对象属性；仍可直接绘制下一笔，下一笔继续使用独立的工具默认值。
- selected-object：Select 选中的对象，或当前绘图工具刚完成的同类型对象，显示当前/预览属性，修改走场景事务，不写默认样式。对象拖动/控制点仍只在 Select 中启用；绘图工具不会因保留属性目标而误拖旧对象。
- Select 空态及 Pin 不显示属性面板。切换工具（包括重新点击当前工具）或 Esc 取消选中后回到工具默认值；undo/redo/delete 清除目标，面板以“矩形 · 默认样式”或“矩形 · 已选标注”等双语提示区分目标。
- “恢复矩形工具默认值”总是只重置当前类型的工具默认样式；在对象上下文显示时名称明确，不修改当前对象。它不提供“把现有对象重置”的隐含动作。

面板数值提交、属性切换、还原均通过同一个属性模型验证。无效输入保留编辑文本和错误状态但不进入 committed/draft scene。滑杆拖动松手为一次事务，键盘连续调节在 blur/Enter 时完成；取消恢复初始值。默认样式也在事务结束时保存，而不是每个 input 事件落盘。

替代方案：一律让面板同时修改对象和下一笔默认值。该模式会使修旧图意外改变后续画图，违反确认的隔离规则。

### 4. 编辑事务将预览与历史提交分离

以插件内 hook/controller（建议 `useCaptureAnnotationEditing.ts`）拥有一个显式 transaction union：property、move、resize、arrow-endpoint、text，以及初始对象快照、当前预览、目标 ID 和 pointer/session identity。场景历史仍由 reducer 拥有。

流程为 begin → preview 多次 → commit 一次，或 cancel 无历史。预览替换场景中的同 ID 对象，而不是追加一份临时对象；commit 验证目标仍存在、session 未过期、有效值确实变化后执行一次 replace/remove。新增文字仍在提交时 add。

- reducer 对未改变对象/不存在目标/无效删除保持原状态，不清空 redo。
- 完成修改才 pushUndo 并清空 redo；Select、默认样式、裁剪几何不进入标注历史。
- 工具切换时先结束有效属性/文字编辑；pointer 手势尚活跃时暂缓工具切换和场景级 undo/delete。Canvas 和输入各自只拥有一条输入路径。
- Copy/Save/Pin 在任何未完成文字、属性或指针事务期间禁用；不把预览对象悄悄作为最终结果。显式 Cancel 按钮仍是退出截图会话的动作。
- 组件卸载、会话结束或目标删除时丢弃草稿、解除 pointer capture、清理资源；迟到回调不能提交到新事务。

替代方案：每次 pointer move 调 reducer.replace，再在 undo 时合并。事后合并难以保持取消、redo 分支与无变化操作的准确性，因此在提交之前隔离草稿。

### 5. 单对象几何复用坐标模型，命中和裁剪移动分开

新增纯对象几何模型（建议 `captureAnnotationGeometry.ts`）提供 selectable bounds、handle hit test、平移、缩放和端点变换。继续使用 source↔viewport 映射；控制点命中半径按 CSS px 定义，图形值按源像素定义。

- 命中优先级：DOM 控件/当前编辑输入 → 裁剪和对象控制点 → 从后到前的对象包围盒 → 无标注选区内部平移 → 选区外重画。保留当前包围盒选择模型，不在本次加入精确路径选中或穿透选层；文字使用共享布局测量得到包围盒。裁剪与对象控制点冲突时裁剪手柄优先，并以不同样式区分。
- Select 的单击先选中，越过现有一致的拖动阈值才移动；未越过阈值不改变几何或历史。空白点击取消选中，空白拖动继续既有 grab/grabbing 选区平移。
- Rectangle/Ellipse/Mosaic 以八个控制点改变边界，最小有效宽高沿用当前标注 4 源像素，防止反向翻转。Arrow 只拖两端，最小有效长度沿用 4 px。移动保持宽高，达到源图边界即 clamp。
- Pen 以整体包围盒映射全部点，保留配置的笔宽。零宽/零高轴保持退化轴并按平移处理，不除以零；不新增路径节点、旋转或等比缩放手势。
- Text 只有选择/移动边界与字号控制，不提供拉伸手柄。几何锚点保持在图像内；超出图像的笔触或大文字通过图像边界裁剪，不暗中缩小字体。已有 crop 可独立移动，因此不把标注强制限制在 crop 内。
- 裁剪平移仍不移动源图锚定标注；标注平移仍不移动裁剪。输出按当前 crop 剪切。

替代方案：直接拖动截图选区来实现“对象移动”，或让变换隐式缩放笔宽。前者混淆两类几何，后者破坏属性数值含义，因此均不采用。

### 6. 文字编辑以原对象快照为基准，输入法优先

文字草稿显式区分 create/edit，edit 带原对象 ID、初始内容和属性；双击只在 Select 命中文本时启用。编辑期间原对象在 scene preview 中被草稿替换或临时隐藏，避免双重绘制。textarea 与 Canvas 共用字体、字号、粗细和行高（现有 1.35）；Canvas measureText 与相同的行布局计算 bounds，而不是按字符数估算粗体/中文宽度。

Enter 换行；Cmd+Enter/外部点击提交；Esc 取消该 draft。输入法 composition 期间忽略场景级热键，也不以 Enter/Esc 提前提交或取消。外部点击只完成当前文字编辑，不同时启动新画笔或新的 crop 手势；文本属性控件属于同一编辑域，不在调整字号/颜色时误提交。空白已有文字提交为一次 remove，新空白 draft 不入历史。

### 7. Esc 与输入优先级统一路由

先判断 composition，再由 focused editable / 原生控件处理；之后为活动文字/数值/滑杆/对象或裁剪手势回滚 → 单对象 deselect → 原有 cancel_screenshot_session。每层处理后立即 return，并在需要时 preventDefault/stopPropagation，确保一次 Esc 只处理一层。文字取消后恢复其对象选中，下一次 Esc 才取消对象选中。

Delete/Backspace、Cmd/Ctrl+Z、Shift+Cmd/Ctrl+Z、Cmd/Ctrl+Y 保留；input/textarea/contentEditable 和 range/color 不被 canvas 监听截获。裁剪方向键 nudge 只在没有输入编辑和活动对象事务时运行，本次不新增对象键盘 nudge。

### 8. 预览与导出共享合成，不透明度按整个对象应用

复用 `drawAnnotations` 和最终合成入口，加入统一场景解析。每次渲染从冻结 base image 开始，再按 z-order 绘制已提交对象与单个事务替换对象；Mosaic 始终对本次重建场景中它之前的合成像素采样，不重复采样上次预览，像素块变化具有可逆性。

- 常规不透明标注直接绘制；半透明对象先在按可见 bounds 加笔触/箭头头部留白计算的透明临时画布上用完整 alpha 绘制，再以 opacity 合成一次，避免箭头杆和头、文字重叠部分变深。
- 临时画布裁到源图片可见区域，单次复用，使用现有尺寸/资源约束；不为每个对象常驻一张全屏画布，完成和取消/关闭时释放。无法创建上下文或编码失败时显示本地化错误，保留场景供重试，禁止悄悄丢对象或改成不透明导出。
- 矩形采用同一归一化 roundRect path 表现 outline/solid；椭圆同样选择 stroke/fill，双向箭头以端点反向生成第二个头；所有对象在 save/restore 内隔离合成状态。
- 选中框、控制点和面板使用独立展示层；PNG 只合成场景，再按既有 crop 和 crop radius mask 导出。Pin 继续原区域提交路径，使用同一 committed scene。
- OCR adapter 不改，继续读取 original frozen pixels；提示文案和原始来源测试保留。

替代方案：只设置全局 globalAlpha 后逐段绘制，或为所有对象创建持久全屏图层。前者会产生组件重叠透明度错误，后者放大高分屏内存占用；临时局部合成兼顾数值语义和资源边界。

### 9. 默认样式使用独立的本地配置，不扩展 IPC

新增插件内 `captureToolDefaults.ts` 纯存储 adapter，以 localStorage 的 `zero.snap.annotation-defaults.v1` 保存 `{ version: 1, tools: ... }`。只序列化六种工具允许的样式字段，读取先当作 unknown，再逐字段验证颜色、整数、有限范围、枚举和版本。兼容现有主偏好键及迁移输入，不读写它们来保存本次工具样式。

缺失/损坏字段独立回退，合法越界整数 clamp，未知字段忽略；未知版本初始化不覆盖，只有用户主动完成默认值修改或恢复默认才可写入当前支持版本。读写异常不阻断 capture；保存失败显示可关闭的双语非阻塞提示，当前会话仍保留新值。每次默认样式操作结束写一次，避免 unload 才落盘导致跨窗口丢失。

不持久化任何 scene、text draft、pixel、geometry 或 session 信息。已有截图 WebView 与 macOS 应用重启后的真实存储恢复作为独立验收；不能把 mock storage 测试当作重启证明。

替代方案：把绘图默认值并入全局 AppPreferences 并通过新 Rust 命令保存。当前只是前端样式配置，独立版本键可避免宿主核心依赖 Snap；无需扩大 capability 或原生文件 API。

### 10. 面板与工具栏作为测量后的组合布局

复用 `captureToolbarModel.ts` 定位思路，增加测量后的 secondary-panel bounds 和 geometry-bar 避让区域；面板放在对应类型按钮下方，以按钮左边附近为水平起点，并用小三角指向按钮中心；可见范围不足时夹入组合布局边界，三角仍追踪按钮。工具栏水平滚动时重新测量；锚点滚出可见区域时隐藏三角，避免错误指向。组合布局继续翻转或夹入视口安全边界。面板内容变化和 viewport resize 都触发重测。空间不足时内部换行/有界滚动，不让主 Copy/Save/Cancel 变成不可达。

屏幕控制点和文本输入保持现有坐标转换路径；不重新计算 display origin。所有控制用双语 label/tooltip、非纯颜色状态和可见焦点。原生 color chooser 的焦点切换属于合法编辑，不引入 blur-to-cancel；真实 macOS 验证其弹窗与屏幕保护交互。

### 11. 与现有变更的定向衔接

| 活跃变更 | 保留的行为 | 本次新增/定向覆盖 |
| --- | --- | --- |
| `optimize-screenshot-toolbar` | 图标顺序、双语/可访问名称、裁剪与标注分离 | 属性面板与控件测量；Esc 在对象选中态增加 deselect 层，快捷键名保持 |
| `enhance-zero-snap-smart-selection` | targeting、首帧、crop 宽高/radius、透明角导出 | 对象 radius 独立；数值输入/几何手势遵守既有输入优先级 |
| `enhance-snap-and-share-offline-ocr` | 原生菜单、会话/显示器、crop grab/grabbing、原图 OCR | annotation 命中由仅选中扩展为选中/移动；crop 与对象手势共用取消优先级 |
| `optimize-zero-snap` | 手动选区及工具动作的现行部分 | 不恢复已由 OCR change 替代的旧卡片菜单或内部重画语义 |
| `systematic-performance-and-code-optimization` | raw media/token/lease、无 Base64、大资源释放 | 临时图层与事务预览同样遵守有界分配和退出清理 |

主规范没有上述 Snap capability，因此本次以三个独立 ADDED capabilities 表达新行为。未来只有在获准 sync/archive 时，再按实际依赖处理旧 delta 的一致性；本轮不复制旧能力为主规范，也不修改旧场景 ID、历史证据或任务勾选。

## Risks / Trade-offs

- [属性和几何草稿交叉导致误提交或多条历史] → 单 transaction owner，指针/面板/文字分别 begin-preview-commit，并验证失捕、Esc、无变化与 redo 分支。
- [局部透明层漏算箭头头部、粗线或文本 bounds] → 统一可见渲染 bounds 和布局测量；用重叠半透明与边缘裁剪 fixture 校验 PNG，而不只断言 Canvas 方法调用。
- [马赛克被误解为不可逆脱敏] → 只承诺全覆盖像素化；不提供透明度，不宣称无法恢复隐私，验证重渲染不混回原图。
- [高分屏大量实时重画产生额外分配] → 合并到动画帧、复用单个有界临时 canvas、在 session 结束释放；记录真实 macOS 拖动和资源回落，不用 bundle gate 代表运行时性能。
- [原生颜色选择器、中文输入法和焦点事件差异] → 明确编辑域和 composition 处理，列为真实 macOS 手工门禁；浏览器 mock 只验证局部逻辑。
- [未知版本/不可写本地存储] → 初始化不破坏未知记录，默认值内存可用，保存失败准确提示，不把失败归为截图失败。
- [新对象控制点和 crop 控制点争抢手势] → 明确命中顺序、独立样式和相同源像素映射，保留旧 crop resize/drag 回归。

## Migration Plan

1. 在授权实施后，先完成属性模型/兼容归一化、几何和事务测试，再依次接入共享渲染、面板、文本与存储。新字段对旧构造按当前视觉初值归一化，旧主偏好不迁移。
2. 运行前端测试/构建、独立 build-graph 快照、项目 Rust 格式/检查/测试和 strict OpenSpec；本次预期无 Rust 代码变化，但仍记录适用的整体回归结果，不伪造跨端功能验收。
3. 用 `pnpm tauri dev` 验证真实 macOS 六工具、对象选择/拖缩、中文输入/原生选色、应用重启默认值和 Copy/Save/Pin；Retina/屏幕边缘/多屏展示证据单独标注。旧未完成设备门禁不自动勾选。
4. 回滚时撤回本次前端模型和界面；旧版忽略独立默认值存储键，原有 `zero.preferences.v1`、原生截图协议和用户文件不受影响。无需删除保存的默认值、同步/归档规范或修改安装包审批。

本次仅创建提案工件；上述步骤均未执行，所有实施和人工验收任务保持未勾选。

## 2026-10-20 交互修订

用户实际截图反馈覆盖原先“绘制后默认样式”的选择：绘制完成即编辑当前标注，同时保留连续绘制。默认值和对象属性继续隔离；面板改为对应按钮下方带指示三角的布局。
