## Context

问题与访谈结论见 [proposal.md](proposal.md)。当前 `CaptureApp.tsx` 用 `tool === "select"` 限制 selectedObject、几何命中和文字双击；属性目标还要求对象类型等于当前工具。`captureAnnotationGeometry.ts` 已有八点、箭头端点和变换，但主体命中是包围框外扩 6 源像素，文字无手柄。`captureSelectionModel.ts` 也调用同一命中函数，因此只修改 pointerdown 会造成光标和实际操作分歧。

`AnnotationEditController` / `useCaptureAnnotationEditing` 已有快照、预览、提交、取消与过期回调拒绝；`captureReducer` 保留 ID/层次并过滤无效或无变化替换。`captureCanvas` / `captureExport` 共用原图坐标、文字布局和场景。工具默认值独立保存，字体范围为 12–96 源像素。上述能力复用，不重建编辑器。

## Goals / Non-Goals

**Goals:** 六类对象的直接编辑与连续绘制共存，几何、光标、属性与输出解释一致；不将裁剪平移混成对象平移；避免屏幕缩放改变点击难度。

**Non-Goals:** 平台、工具与生命周期边界见 proposal；不增加对象键盘微移、层级调序或字体选择，不改变默认样式持久化、原生窗口、快捷键注册与截图权限。iShot 图片只作交互参考，其中显示的聊天文字不是项目指令。

## Decisions

### 1. 方案选择与实现归属

维护者确认在原有 Canvas 上扩展直接编辑。自动切到 Select 无法保持确认过的当前绘图工具；迁移 Konva/Fabric 需适配现有马赛克、裁剪、raw 输出和资源清理链路，与本轮范围不匹配。现有几何/事务已满足主要需求，因此不新增运行时依赖，不声称已重新核验第三方维护或版本。

| 文件 | 职责与变化 |
| --- | --- |
| `captureAnnotationGeometry.ts` | 可见形状命中、显示容差换算、文字四角、比例变换；文字渲染布局继续共用 |
| 新 `captureAnnotationInteraction.ts` | 纯函数决定对象手柄、对象主体或空白目标，区分当前绘制工具和选中属性类型 |
| `CaptureApp.tsx` | 会话/DOM/指针捕获编排，去除 Select-only 几何与双击门槛；调用纯规则，不放大条件树 |
| `captureSelectionModel.ts` | 移除独立包围框命中判断，与主体路由/光标共用形状命中与容差 |
| `captureAnnotationEditing.ts`、`useCaptureAnnotationEditing.ts` | 复用现有事务；只在必要的取消/工具切换接口处适配 |
| `captureHotkeys.ts`、`capture/i18n.ts`、`src/App.css` | 保留热键分层，补 Option/Shift 双语可发现提示、光标和对象手柄区分；不新建大面板 |
| Snap unit/browser 测试与 fixture preparation | 替换旧 Select-only 预期，测试真实输入与 PNG 输出 |

Rust 仍只负责会话、截图、权限、媒体和原生输出。前端标注没有新增跨端数据，不新增 command/invoke/capability 或本机文件访问。

### 2. 当前工具和当前对象分离

`tool` 始终指下一笔使用的工具；`selectedId` 是当前被编辑的对象。任何绘图工具下可选中任意类型，面板依据对象类型显示，不偷偷切换 `tool`；结束新绘制后对象立即选中并显示对应控制点。下一笔只取 `defaults.styles[tool]`，不继承选中对象的属性。显式点击/重新点击工具按钮清除对象选中并显示该工具默认值，沿用现有行为。

对象属性变更、移动、缩放、双击文字都不改当前工具、默认样式或对象层次。点击空白清除选中；绘图工具下有效拖动开始新对象，Select 下空白点击不改变 crop 或历史，拖动才进入既有 crop 平移/重建。Text 的空白点击仍按原行为进入新文本草稿。

### 3. 输入优先级与 Option

事件顺序明确为：

1. 输入法/活动文字草稿/属性控件/工具栏/几何数值输入优先处理自身操作；外部点击只提交文字，不同时开始绘制或移动。
2. 已选对象控制点（所有绘图工具和 Select）。
3. crop 控制点（仅 Select）；与对象控制点重叠时对象控制点优先。以可执行的共享命中顺序处理，不能仅依赖 DOM 覆盖顺序。
4. 对象主体，最上层真实命中优先。
5. 空白：绘图工具按当前工具绘制；Select 按既有 crop 规则平移/重建；钉图仍为动作，OCR-only 无此入口。

Option 只在 pointerdown 采样为 `bypassObjectBody`，跳过第 4 步，不跳过控件或控制点；一次手势中释放或再次按下 Option 不转换手势。Select 下 Option 同样只略过主体，空白行为仍是 crop 操作。所有双击文字入口也尊重 Option；带 Option 的双击不进入旧文字编辑。

普通对象点击建立/更新选中，不生成历史；超过现有对象拖动阈值才预览移动。双击命中文字不先新增文本/画笔、不改变 crop。已有对象移动与文字编辑均复用当前事务 owner。无选择区时仍保持原始智能选区流程；OCR-only 不启用对象路由。全局快捷键与 macOS Option 的其他窗口行为不改变。

### 4. 按真实形状命中，容差按 CSS 像素解释

实现者决定使用主体 **6 CSS px** 附加容差，控制点仍为 **8 CSS px** 命中半径；这是实现默认值，不是维护者指定的数值。用现有 contain 映射的 scale 换算为源像素，不能直接使用 devicePixelRatio。形状先做有容差 bounds 快速排除，再做精确测试，逆序遍历不改变 z-order。

- 矩形：与渲染共用圆角归一化。空心按圆角矩形描边距离命中；实心按填充区域与外缘容差命中，圆角外的空白不会成为填充命中。
- 椭圆：实心命中内部及外缘容差；空心计算到椭圆边界的距离，不能仅用外接框，也不能用未经距离修正的隐式方程误放大长椭圆容差。
- 箭头：箭杆线段距离及 `arrowHeadPoints` 对应实心三角形/边缘，双向箭头两个头都有效。零长度/近零长度不会除零。
- 画笔：各折线段距离，含圆端点和单点退化路径；不命中路径间大块空白。
- 文字：沿用测量后的布局区域（含行间空白），不做逐字像素拾取。马赛克按矩形区域；两者不需要逐像素读回。

透明度不改变命中区域，保持低透明度对象仍可修改。Pin 不作为绘图对象目标。pointerdown、hover、Select crop 光标和 double-click 共用相同几何与缩放参数，不保留旧包围框命中分支。对细长椭圆采用有界距离求解，对画笔不每次创建 Path2D 或全图离屏 Canvas；没有不可控迭代或像素 readback。

### 5. 比例、锚点和边界

所有变换从手势开始的原对象计算，避免逐帧累计误差。身份、颜色、线宽、opacity、填充方式、pixelSize 和层次不变；矩形 cornerRadius 继续按新尺寸合法上限归一化。几何锚点限制在原图范围（文字为 x 和基线 y，笔触/字形允许溢出后裁切），crop 只决定输出裁切，不挤压对象到 crop 内。

- 矩形/椭圆/马赛克：八点自由缩放；Shift 按每次 pointermove 的状态保持**手势开始时**比例，切换修饰键仍从原快照计算。角点固定对角；边点固定对边中点，并围绕该中点对称调整另一轴。保持现有最小 4 源像素尺寸，不允许翻转。比例缩放使用统一因子裁到原图边界，不能独立 clamp 两轴破坏比例。
- 画笔：保留八点，始终统一比例因子。角点固定对角，边点固定对边中点。零宽或零高笔迹由非零轴决定比例，零轴不拉出新形状；全零单点缩放为 no-op，但仍可移动。线宽不变，Shift 不切换为拉伸。
- 箭头：沿用整体移动与两个端点；端点只改自身，最短 4 源像素规则保留。本轮不新增角度吸附或 Shift 限角。
- 文字：四角手柄，按统一比例推导整数 fontSize，沿用 `PROPERTY_RANGES.fontSize` 的 12–96 源像素。固定对角的布局锚点，重新测量并重算文本 x/基线 y；字号取整后按真实测量结果放置，不拉伸字形、不重排手动换行。Shift 不改变语义。达到字号上下限或固定对角下 x/基线 y 即将越出原图时，停止在手势路径上最后一个合法整数大小，不事后 clamp 位置造成固定角漂移。现有合法锚点的字形/行布局溢出仍由原图裁切，不为使全部字形可见而自动缩小字号。这一边界细化由实现设计确定，并未新增用户可配置项。

文字缩放和属性字号都必须通过同一数值规则与 `textLayout`；文字草稿激活时不显示几何控制点。绘图工具下双击文字也复用现有多行编辑域、IME、Cmd+Enter/外部点击提交、Escape 取消与空白删除规则。

### 6. 历史、默认值、输出与可发现性

复用一次 begin-preview-commit；取消、pointercancel、失捕、无变化、非法目标不加历史或破坏 redo。工具切换取消未完成几何事务并清除对象选中，迟到事件不能提交旧对象。完成编辑前 Copy/Save/Pin 不消费草稿；已提交 scene 走原共享 renderer，控制点和提示不进入 PNG。Mosaic 移动/缩放重新采样当前位置的前序 scene，不把旧马赛克块当贴纸移动，pixelSize 不随几何缩放。

不把任何对象/文字/截图写入工具默认值。OCR 仍读取冻结原图，不读取标注 scene。提示通过已有工具提示/紧凑辅助文本表达“拖动标注编辑 · Option 穿透绘制”“Shift 保持比例”，中英完整、键盘焦点可见、不加入遮挡图像的大教程。保留 Select 和属性数值控件作为明确入口，不宣称画布完全可用键盘完成。

### 7. 与现有 active deltas 的定向关系

本变更新增一个后继 capability，因为相关旧能力未进入 `openspec/specs`。以下覆盖仅在本变更实施后生效；旧文件及历史证据保持原样，后续获准同步/归档时必须按依赖顺序解决冲突，不能同时保留相反的规范作为最终主规范。

| 旧变更/要求 | 本轮后继规则 | 保留内容 |
| --- | --- | --- |
| `enhance-snap-annotation-editing` / Drawing and object selection remain distinct modes | 去除 Select-only 与类型相同限制；新对象立即显示几何控件；形状精确命中 | 当前工具与默认值独立、顶层优先、单选、工具显式切换清选中 |
| 同变更 / Single objects support type-appropriate geometry editing | Pen 等比例、Text 四角字号缩放、形状 Shift 比例 | 原图坐标、有限边界、ID/样式/层次、箭头端点 |
| 同变更 / Annotation gestures preserve crop interaction priorities | 本设计第 3 节优先级；所有绘图工具允许对象手势 | Select 空白 crop 操作、失捕/取消回滚、对象手势不移动 crop |
| 同变更 / Text annotations support reversible multiline re-editing | 所有绘图工具与 Select 可双击 Text | 其余多行/IME/提交/删除/历史全部保留 |
| 同变更 / Escape unwinds one editing layer at a time、History records completed edits rather than preview events | 无覆盖 | 全部保留且覆盖新增入口 |
| `optimize-snap-floating-panels` | 选中类型可与当前工具不同，面板锚到选中类型按钮 | 紧凑布局、组合拖动、默认红色、位置不持久化 |
| `optimize-zero-snap`、`enhance-zero-snap-smart-selection` | 主体命中改为真实形状 | crop 控制/智能候选/尺寸/圆角/源图映射 |
| `refine-snap-entry-shortcuts-and-startup`、`enhance-snap-and-share-offline-ocr` | 无覆盖 | 快捷键、启动、显示器、Windows/OCR-only、原生菜单和原图 OCR |

## Risks / Trade-offs

- [对象优先让实心图形/马赛克内部难以起笔] → Option 穿透主体；双语提示与真实 macOS 测试，确保不会穿透控件。
- [跨工具选中后面板操作错改绘图默认值] → 当前工具与选中对象分离；通过不匹配类型的交互和 storage 检查验收。
- [对象/crop 控制点 DOM 覆盖改变命中顺序] → 显式统一目标仲裁，测试二者重叠及屏幕边缘，而不是只检查静态样式。
- [文字字号取整、字体测量与固定角点发生漂移] → 共用 Canvas 布局与基线，按最终字号重新测量；中英、多行、粗体和 12/96 边界单独断言。
- [细长椭圆、圆角、箭头头部和高缩放下命中偏离显示] → 显示像素容差、几何距离与实际像素 fixture 对照，不能以包围框回退掩盖误差。
- [Shift 或 Option 在手势中切换造成模式跳跃/比例破坏] → Option 仅起点采样，Shift 从原快照重算；边界采用同一比例约束。
- [大量笔迹 hover 成本] → bounds 预筛选、纯几何距离、动画帧复用现有绘制，不新建常驻全屏图层；真实高分辨率流畅度作为独立设备证据。

## Migration Plan

1. 按 [tasks.md](tasks.md) 在授权实施后先覆盖真实失败的命中/缩放测试，再接入统一仲裁和 UI，更新旧 Select-only 与 Pen 自由拉伸预期，不删除取消/输出保护。
2. 运行前端与指定浏览器脚本、生产构建/包体、适用 Rust gates 和 strict OpenSpec；实施阶段的实际结果与未完成设备门禁见 evidence/implementation.md。
3. 使用 `pnpm tauri dev` 记录真实 macOS 六工具、Option/Shift、Retina/边缘、中文输入和 Copy/Save/Pin/OCR；设备不可用的组合维持未完成，不把浏览器证据写成原生验收。
4. 无 schema/持久化迁移；回滚只撤回本轮前端和测试。旧默认样式、原生协议和已保存 PNG 不需修改。提交、推送、同步和归档均另按用户授权执行。
