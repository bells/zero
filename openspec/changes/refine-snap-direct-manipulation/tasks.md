## 1. 形状命中与纯手势目标

- [x] 1.1 按 [implementation-plan.md](implementation-plan.md) Task 1 为描边/填充、圆角、细长椭圆、双箭头头部、单点/多段 Pen 和显示缩放增加失败测试；先记录 `pnpm test:unit` 对新增预期失败，再实现真实几何命中并验证相同命令通过，不删旧事务保护测试。
- [x] 1.2 实现纯对象/crop 目标仲裁，统一 pointerdown、hover、双击和 Select 光标的命中参数；单测验证对象控制点优先、crop 控制点仅 Select、顶层真实形状、Option 只略过主体及无选择区/OCR-only 排除。

## 2. 分类型缩放

- [x] 2.1 按计划 Task 2 给矩形/椭圆/马赛克加入 Shift 比例和固定对角/对边中点约束，验证边界统一因子、最小 4 源像素、无反转、半径归一化以及 Shift 中途切换不累计误差。
- [x] 2.2 让 Pen 八点始终等比例缩放且线宽不变，更新旧自由拉伸预期；测试横/竖零轴、单点 no-op、边界和身份/样式/层次保留。
- [x] 2.3 新增文字四角字号缩放，复用 12–96 范围和测量布局；测试中英/多行/粗体、四个固定对角、上下限、取整、靠边停止缩放且固定角不漂移、合法锚点字形溢出裁切、无自动换行和字号属性/导出一致性。

## 3. 直接编辑与 UI 接入

- [x] 3.1 按计划 Task 3 分离当前工具和选中对象，移除 Select-only 与同工具属性门槛；浏览器验证新对象立即显示控制点、跨类型选中跟随面板、保留当前工具和独立默认值、工具显式重选清除对象。
- [x] 3.2 接入统一指针与光标仲裁，记录 Option 起点状态和 Shift 实时状态；浏览器验证连续绘制、空心内部绘制、Option 在实心/马赛克上起笔、修饰键途中改变，以及对象/crop 控制点重叠与空白 Select/绘制的不同结果。
- [x] 3.3 开放所有绘图工具下双击旧文字，复用原草稿编辑域；浏览器验证不多画对象、不移动 crop、不切工具，Enter 换行、Cmd+Enter/外部点击提交、Esc 回滚、空白删除与 IME 不误触发场景操作。
- [x] 3.4 补齐中英 Option/Shift 提示、move/resize 光标、对象与 crop 控制点区分和可见焦点；浏览器检查中英文、窄视口、屏幕边缘、面板切换/滚动，不扩大现有紧凑面板或侵入其他插件。

## 4. 事务、输出与模式回归

- [x] 4.1 按计划 Task 4 回归一次拖动一条历史、无变化/取消保留 redo、Escape/失捕/pointercancel 回滚、工具切换取消和迟到事件拒绝；检查新入口没有绕过已有 controller 或改变默认值。
- [x] 4.2 扩展合成 PNG 像素检查，覆盖缩放文字、细线/双箭头、Mosaic 新位置采样且 pixelSize 固定、crop/radius 裁切、无控制点/提示、Copy/Save/Pin 共用 committed scene，活动草稿不被提交。
- [x] 4.3 回归初始智能选区、OCR-only、原图 OCR、选择模式 crop 平移/重建、raw lease 输出及默认值存储白名单；通过实际 fixture 行为与必要的现有 source-contract 检查验证，不声称 Windows 自定义编辑能力。

## 5. 自动门禁与维护记录

- [x] 5.1 串行运行 `pnpm test`、`pnpm build`，构建后运行 `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph-direct-manipulation.json`；保留真实命令/退出码，避免并发 fixture 准备或覆盖历史包体快照。
- [x] 5.2 启动本地 Vite 后串行运行计划 Task 5 指定的 Snap 浏览器脚本，修复与新交互冲突的旧断言但保留输出/取消保护；记录浏览器与 mock IPC 范围，不能据此勾选原生设备任务。
- [x] 5.3 运行 `cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo check --manifest-path src-tauri/Cargo.toml --locked`、`cargo test --manifest-path src-tauri/Cargo.toml --locked`、`openspec validate --all --strict` 与 `git diff --check`；保存首个失败及获准复测结果，不通过削弱测试掩盖环境问题。
- [x] 5.4 更新 `src/plugins/screenshot/capture/README.md` 和本变更 evidence，按实际代码修订 Select-only/文字手柄说明，记录自动化结果与待验收项；验证本地链接和旧 delta 定向关系，不改旧证据/任务、不顺带同步归档、提交推送或发布。

## 6. 真实 macOS 验收

- [ ] 6.1 用 `pnpm tauri dev` 验证六工具画完立即编辑、跨工具拖动/缩放/属性、连续绘制、Option 主体穿透与 Shift 比例；在真实应用记录结果，浏览器结果不能代替。
- [ ] 6.2 验证 Retina、四角/小选区、对象与 crop 控制点重叠、中英文文字/中文输入法/原生颜色框、焦点和撤销取消；逐项记录硬件和可用多屏覆盖，未覆盖项保持未完成。
- [ ] 6.3 实际 Copy/Save/Pin 并检查结果，核对文字/透明度/马赛克/crop 圆角与无 chrome；实际 OCR 仍读原图，并确认新会话不恢复旧对象、对象编辑不污染工具默认值。
- [ ] 6.4 在真实高分辨率场景持续拖动复杂 Pen 并结束会话，记录交互与资源回落；没有实测的数据明确保留限制，不由构建成功推断运行时表现。
