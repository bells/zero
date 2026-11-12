## 1. Launch 后台状态与结果布局

- [x] 1.1 在 `tests/unit/plugins/quickLauncher/` 增加后台协调行为回归：连续 poll 不触发可见索引 loading，查询竞争拒绝旧结果，隐藏后忽略完成；先验证旧实现失败，再实现最小调度分离并运行相关测试。
- [x] 1.2 保留显示项 ID/revision 的数字激活约束，覆盖 poll 中激活、真实索引变更、IME/组合键与查询竞争；运行现有 scheduling / shortcuts 测试及新增回归，确认不会按过期位置启动应用。
- [x] 1.3 修改 `QuickLauncherView.tsx` 和相关 CSS，400px 下保留三列、名称/路径两行与右侧操作/快捷键，提供完整路径提示；在中英文、长路径/CJK 标题、macOS/Windows 快捷键标签的渲染中检查无横向溢出和操作换行。

## 2. 宿主自适应尺寸与锚定

- [x] 2.1 为宿主 Rust 几何策略增加行为测试，覆盖 500 逻辑像素上限、小屏、负坐标、混合 DPI、仅箭头带上探、无锚点回退；先观察目标用例失败，再实现策略并运行定向 Rust 测试。
- [x] 2.2 在 `services/popover.rs` 或独立宿主 layout service 保存当前锚点、布局会话和最新 generation，新增薄 `update_tray_layout` command；Rust/TS 显式匹配 serde 字段，以序列化及调用者测试验证 tray-only、非法尺寸、过期会话/世代、重载与原生失败恢复。
- [x] 2.3 在 `src/core/windowing/` 实现自然高度测量与 typed service/hook，接入 `App.tsx` 宿主 wrapper；用行为测试验证一像素去重、并发合并、插件切换、迟到响应、隐藏/卸载清理、IPC 失败无循环重试，运行相关测试。
- [ ] 2.4 调整宿主和五插件的 tray-only flex / overflow 规则，短内容自然收缩，Launch/File 的内部滚动与宿主滚动互斥；逐个渲染五插件，验证顶部动作固定、正常底部边距、长内容/错误/展开控制均可到达，主窗口仍填满工作区。
- [ ] 2.5 macOS Zero/Paper 接入受限 caret-band 上探与重定位，保持独立 placement revision；定向测试通过后，真实桌面检查菜单栏图标点击、遮挡、焦点、关闭/重开并记录是否采用已接受的回退。独立 Paper 及 Launch 窗口尺寸不改变。

## 3. File 空态箭头

- [x] 3.1 在 `FilePanel.tsx` 和相关 CSS 使用一个连续箭头替代分离横线与箭头；在主窗口及显示空态的其他界面检查普通/缩放渲染的中心线、间距和响应式布局，不用重复标记结构的源码字符串测试代替视觉验证。

## 4. 集成验证与证据

- [x] 4.1 串行运行桌面 gates：`pnpm test`、`pnpm build`、Rust fmt/check/test（locked），构建后运行 `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json`；保留失败及有针对性的环境复查结果。
- [ ] 4.2 运行 `pnpm tauri dev` 检查五插件实际托盘与主窗口 File/Launch，连续观察至少多个两秒 poll 周期，检查高度/滚动、长文本、右侧操作、快捷键与箭头位置，并将截图和观察写入本变更 evidence。
- [ ] 4.3 在可用设备验证多显示器/混合 DPI、菜单栏隐藏或显示模式以及 Windows taskbar 定位；不可用的设备验收保持未勾选，并在证据中区分源码、浏览器、macOS 单屏及其他设备结论。
- [x] 4.4 更新本变更证据与完成任务，运行 `openspec validate --all --strict`、本地文档链接检查及 `git diff --check`；未经单独指示不归档、同步主规范、提交或推送。

## 验收边界（2026-11-12）

2.4 的布局源码已经接入五插件；逐插件真实托盘显示与滚动验收与 2.5、4.2 一起保留未完成。维护者明确选择稍后自行验收托盘。主窗口 Launch / File 与真实 Hook 浏览器夹具已检查，详见 [实施证据](evidence/implementation.md)。4.3 的 Windows、多屏和混合 DPI 不以源码测试代替。

## 5. 状态栏图标视觉尺寸跟进

- [x] 5.1 原生派生图标从 18px 改为 22px，并在 NSImage 层覆盖依赖的 18pt 归一化；22pt 点击单元格不变。重新生成全部透明模板图标，`icons:validate`、8 项图标测试、13 项 Rust 状态栏测试、fmt/check 与严格 OpenSpec 校验通过；最终菜单栏观感仍由维护者观察。
