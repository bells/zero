# Awake 主界面布局修正验收

日期：2026-10-11。此记录补充 2026-10-09 的验收，替代其中 main 共用 480px 紧凑模块的布局结论。未提交、推送或归档；原有工作区的原生会话、菜单和图标改动保留。

## 本次调整

- AGENTS.md、PRODUCT.md 和本提案明确所有插件的界面原则：状态栏／托盘工具页简洁，主窗口工具页可使用更丰富的控件和可视化，充分利用工作区。
- main 的 Awake 面板取消 480px 最大宽度，填满工作区；左侧恢复原有配色的圆盘并显示已运行时间，右侧显示当前时长、一次有限剩余和八个预设，底部为完整主动作。
- 圆盘静态表达状态，数字不旋转；低高度窗口缩小至 200px，窄工作区改为上下布局。无新增动画、依赖、IPC、前端到期计时器或 Rust 改动。
- 托盘不显示圆盘，继续使用紧凑计时信息。两种布局共用原有 hook、状态和动作；每个界面的已运行／剩余数字各出现一次。

## 自动检查

| 检查 | 结果 | 本地记录 |
| --- | --- | --- |
| `pnpm test` | 344 passed，0 failed | `/tmp/zero-awake-layout-tests.log` |
| `pnpm build` | 通过 | `/tmp/zero-awake-layout-build.log` |
| build graph budget | findings / forbidden eager imports 均为空 | `/tmp/zero-awake-layout-build-graph.json` |
| `openspec validate --all --strict` | 23 passed，0 failed | `/tmp/zero-awake-layout-openspec.log` |
| `git diff --check` | 通过 | 收尾检查 |

本次仅修改前端展示和规范，未重新执行 Rust 单元回归；此前原生证据保留其日期语义。

## macOS 原生窗口观察

`pnpm tauri dev` 首轮因沙箱 `listen EPERM ::1:1420` 失败；沙箱外重试遇到已有 1420 端口占用，未据此宣称 dev 交互验收通过，也未结束占用端口的外部进程。改用最终源码和已构建的 dist 生成 debug 应用：

```sh
pnpm tauri build --debug --bundles app --config build/navigation-smoke/tray-native.config.json
```

构建通过，日志为 `/tmp/zero-awake-layout-native-build.log`。测试配置只改变初始 tray 可见性和 Dock 入口；生产配置未修改。CUA 操作 ignored 的 `src-tauri/target/debug/bundle/macos/Zero.app`。

- 中文 920×660 main：未运行、有限会话、侧栏展开／收起均使用整个工具工作区，标题不重复，圆盘和全部控制可见。有限会话的已运行／剩余各出现一次。
- 中文／英文 760×520 main：圆盘自动缩小，所有预设和主动作首屏可见；有限、无期限和未运行状态可操作。窄窗口沿用宿主自动紧凑侧栏。
- 中文／英文 400×500 tray：未运行、有限和无期限三状态，无圆盘；全部八个预设、完整主按钮和宿主底部系统动作首屏可见，没有滚动操作或可见滚动条。
- 托盘开启五分钟后 main 读取同一原生会话；运行中选择无期限后时间重置且剩余行消失。关闭后显示正常状态、00:00 和开启按钮。
- 初次检查发现最小窗口圆盘贴近按钮和英文 finite 托盘轻微溢出；已增加低高度圆盘规则并收紧托盘插件级间距，再构建并复查最终版本。以上截图记录修正后的状态。
- 收尾恢复跟随系统语言、main 920×660 和展开侧栏；每次重启测试实例前均关闭唤醒会话，最后正常退出测试应用。

本次截图为 `main-*-dial-*-2026-10-11.png`、`tray-*-compact-*-2026-10-11.png`，仅含 Zero 界面。未替换 2026-10-09 的历史截图。

## 验收范围

更新后的任务 3.3 已完成。原生菜单点击、错误注入、放大字体／辅助功能完整验收及 Windows 设备等既有未完成项仍保留。本次未验证 Windows、发行包或真实系统菜单栏亮暗视觉，也未重复真实五分钟隐藏到期测试。

## 提交前复核（2026-10-11）

用户请求本地提交后，重新运行整个 Awake 变更的相关门禁：前端 344 项通过，构建、图标校验、bundle budget、全量 OpenSpec strict（23/23）、单独 change strict 和 diff whitespace 均通过。Rust fmt、locked check 通过；沙箱内串行测试为 230 passed、1 failed、1 ignored，唯一失败是原生私有剪贴板不可用，保留 `/tmp/zero-awake-commit-rust-tests.log`。沙箱外完整串行复测为 **337 passed、0 failed、2 ignored**，日志为 `/tmp/zero-awake-commit-rust-tests-native.log`，未削弱或跳过测试。

其余提交前日志：`/tmp/zero-awake-commit-frontend.log`、`/tmp/zero-awake-commit-build.log`、`/tmp/zero-awake-commit-rust-check.log`、`/tmp/zero-awake-commit-build-graph.json`。上述自动回归不改变既有未完成设备验收项；本次提交不包含生成的构建目录或本地日志。
