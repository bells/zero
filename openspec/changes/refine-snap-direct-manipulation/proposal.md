## Why

Zero Snap 已有标注移动、缩放和编辑事务，但几何编辑隐藏在 Select 模式中；绘制后直接拖动会继续画图，整包围框命中又会让空心图形内部和斜线周围的空白拦截操作。依据维护者确认的 iShot 参考交互，本变更让现有六类标注在截图会话内直接可编辑，减少模式切换和重画。

## What Changes

- **BREAKING（编辑器手势）**：macOS 完整截图编辑器在 Select 和六种绘图工具下均可选择、移动、缩放已有标注。绘制完成立即显示对象控制点，保留当前绘图工具；对象属性面板跟随选中类型，下一笔仍使用当前工具的独立默认值。
- 对象优先于绘制；空白开始新的绘制。按住 Option 开始手势时跳过对象主体命中，允许从已有对象上绘制；不穿透控件或控制点。Select 保留空白裁剪平移和选区外重建。
- 空心矩形/椭圆按描边，箭头/画笔按线条及箭头头部命中；实心图形、文字布局区域和马赛克按区域命中，重叠时最上层优先。点击容差按显示像素保持一致。
- 矩形/椭圆/马赛克八点自由缩放，Shift 保持比例；画笔整体等比例缩放且线宽不变；箭身整体移动、端点独立调整；文字新增四角字号缩放，保留手动换行并支持任意绘图工具下双击重新编辑。
- 复用单对象事务、一次完成一次历史、Esc/失捕回滚、默认样式隔离、共享 Copy/Save/Pin 输出和原图 OCR。控制点不进入导出。
- 范围仅限 macOS、已有矩形/椭圆/箭头/画笔/文字/马赛克和本次截图会话。不新增直线/序号/曲线箭头，不增加旋转、多选、组合、工程文件或导出后对象恢复；Windows 仍使用系统截图流程。

## Capabilities

### New Capabilities

- `snap-direct-annotation-manipulation`: 不切换工具的单对象编辑、可见形状命中、Option 绘制穿透、分类型缩放、输入仲裁和回归边界。

### Modified Capabilities

无已同步主能力需要修改。`snap-annotation-object-editing` 等仍位于活跃 change deltas；本能力对其 Select-only、包围框命中、文字无手柄和画笔自由缩放规则做定向后继覆盖。完整衔接见 [design.md](design.md)，不改写旧场景或验收证据，不执行 spec 同步或归档。

## Impact

- 前端仅涉及 `src/plugins/screenshot/capture/`、必要的 `src/App.css` 编辑器样式和 Snap 测试；宿主核心与其他插件不扩展。
- 主要复用 `CaptureApp.tsx`、`captureAnnotationGeometry.ts`、对象编辑 controller/hook、属性面板、选择模型和共享 Canvas 导出；新增纯手势仲裁模块，避免继续堆叠组件条件。
- 不新增 Rust command、IPC 字段、capability、对象持久化或运行时依赖。沿用 React 19/TypeScript/Canvas；现有图形库替换不是本轮范围，不把旧依赖调研当作新的维护状态证明。
- 自动化覆盖形状命中、比例、文字字号、跨工具操作、撤销取消、合成输出和 OCR-only 隔离；真实 `pnpm tauri dev` 下 macOS/Retina/IME/原生输出验收另行记录。实施状态与实际验证见 [实施记录](evidence/implementation.md)，未完成设备验收不视为已完成。
