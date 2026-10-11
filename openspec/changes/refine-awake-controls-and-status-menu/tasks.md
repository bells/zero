## 1. 原生会话协调与状态同步

- [x] 1.1 提取 IPC／状态栏共用的 Awake 会话转换协调入口，沿用 lifecycle 锁、spawn_blocking、诊断观察和 expiry generation；验证现有 finite／no-limit／替换／旧 timer 用例通过，并检查菜单不会在 UI 线程启动／停止进程。
- [x] 1.2 为开启、时长替换、关闭、到期与退出统一发布内部状态失效通知，hook 订阅并读取权威 snapshot；验证托盘／main 可见面板同步，隐藏展示无新增轮询，订阅释放及旧响应／快速操作竞态回归通过。
- [ ] 1.3 完成安全错误码与动作类型的显式 TS/Rust 错误通知和可见反馈路径，避免原生菜单失败被丢弃；验证无面板可见时仍能看到本地化失败，失败后显示真实状态，core/plugin 导入边界检查通过。

## 2. Awake 原生右键菜单与退出

- [x] 2.1 增加限定 Awake item ID 的 typed 预设／退出动作解析与本地化 menu model；验证无期限、5/10/15/30 分钟、1/2/5 小时顺序、分隔线、当前会话勾选及非法 ID／时长拒绝的单元测试通过。
- [ ] 2.2 将 model 接入现有 macOS 组合单元右键菜单，选预设调用统一会话入口；验证未运行开启、运行中重计时、finite→no-limit、原左键快速切换及邻居／Ø 菜单保持既有行为的集成回归通过。
- [x] 2.3 实现“退出 Awake”停止原生唤醒、撤销 expiry、合并保存 Awake 可见性并清理组合单元反馈；验证停止失败不隐藏、保存失败保持关闭、未运行退出、其他工具设置保留及旧计时器不影响新会话的回归通过。
- [x] 2.4 接通现有设置恢复入口及界面反馈，保留 panel disable 与全 Zero quit 的各自语义；验证恢复图标不启用会话、main 仍可显式开启、重启保持隐藏且无自动唤醒的状态／设置测试通过。

## 3. 按界面职责区分 Awake 面板

- [x] 3.1 移除 POWER、托盘圆盘和正常状态重复说明，main 保留圆盘计时，使用标题／状态、已运行／当前／有限剩余的信息行及独立错误区域；验证正常三状态的信息完整、有限剩余只出现一次、错误仍可访问。
- [x] 3.2 调整插件级托盘布局，使八个预设与至少 44px 主按钮在默认 400×500 首屏可见；验证中文／英文正常三状态截图，无纵向滚动且宿主底部动作可见，其他插件样式不受影响。
- [x] 3.3 按 2026-10-11 用户反馈恢复 main 圆盘、取消 480px 限宽并填满工作区，沿用同一 panel/hook；验证 920×660、760×520 和侧栏展开／收起时无重复计时／标题、完整操作可见，见 evidence/layout-verification-2026-10-11.md。
- [ ] 3.4 补齐焦点、选中／busy、中文／英文标签、错误滚动、放大字体和 reduced-motion 行为；验证键盘 Tab/Enter/Space、36px 预设／触摸 44px 目标、AA 对比度及无每秒 live 播报。

## 4. Awake 状态图标

- [x] 4.1 将 Awake active SVG 调整为单色实心杯体，保留空杯 base、手柄／底座／外部轮廓和透明留白；验证 16/18/22/24px 亮暗背景及 1×/2× 可清楚区分，两状态不移动图形／命中边界。
- [x] 4.2 更新图标校验、React 派生、tray PNG 和 contact sheet 中仅涉及 Awake 的状态约束与资产；运行 `pnpm icons:validate`、`pnpm test:icons` 并检查生成结果与 masters 对应，其他图标无意外变更。
- [x] 4.3 更新 `docs/icon-system.md` 的空杯／实心杯描述及本变更的旧规范定向替代说明；验证文档与最终资产一致，旧实机证据未被当作新图标已验证记录。

## 5. 集成检查与实机验收

- [x] 5.1 运行 `pnpm test`、`pnpm build`，构建后运行 `node scripts/performance/build-graph.mjs --check --output /tmp/zero-awake-build-graph.json`；验证前端门禁与 bundle budget 通过，不覆盖历史 evidence。
- [x] 5.2 运行 `cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo check --manifest-path src-tauri/Cargo.toml --locked`、`cargo test --manifest-path src-tauri/Cargo.toml --locked`；验证原生门禁通过，若原生环境限制失败则保留首轮记录并按项目规则调查复测。
- [ ] 5.3 使用 `pnpm tauri dev` 在 macOS 验收托盘／main 首屏、中英文、左键切换、所有右键预设和两个退出项、错误反馈；在本变更 evidence 保存截图与实际结果，验证右键不误切换、邻居动作和局部高亮／tooltip 未退化。
- [ ] 5.4 在真实 macOS 菜单栏亮暗外观验证空杯／实心杯与固定命中区域，并运行真实 5 分钟隐藏界面到期流程；记录原生唤醒停止、图标恢复和重新打开面板状态，不能仅靠模拟时钟勾选此项。
- [ ] 5.5 在 macOS 实机验证运行时退出 Awake、重新打开主面板、设置恢复、Zero 重启以及折叠／展开后的单元路由；记录无残留 caffeinate／expiry、隐藏设置保存且其他工具继续运行。
- [ ] 5.6 在 Windows 设备验证共享紧凑面板、单图标 fallback、native keep-awake、时长替换与到期；缺少设备时将本项保留未完成并在 evidence 明确说明。
- [x] 5.7 运行 `openspec validate --all --strict` 和 `git diff --check`，将最终自动／macOS／Windows 证据分别记录在本变更；验证每个已勾任务有对应证据且不修改其他 change 的任务状态或触发归档。
