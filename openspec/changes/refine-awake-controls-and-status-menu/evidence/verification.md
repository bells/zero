# Awake 实施与验收记录

日期：2026-10-09。工作区：`/Users/watson/work/zero`。本记录区分实现、自动回归、macOS 桌面观察和待验收项；没有提交、推送、发布或归档。

2026-10-11 布局修正：main 已恢复圆盘并填满工作区，托盘继续保持简洁。本文件的紧凑 main 描述与截图是历史结果；当前布局与复查见[补充验收](layout-verification-2026-10-11.md)。

## 已实现

- 空杯／实心杯保持外部几何、手柄、底座和宿主命中区域一致。主 SVG、18px native PNG、校验与 contact sheet 对齐。
- 托盘和 main 共用紧凑面板：移除 POWER、圆盘和重复状态说明；保留状态、已运行、当前时长、一次有限剩余、八个预设和主动作。
- Awake 专属原生菜单提供无期限、5/10/15/30 分钟、1/2/5 小时及勾选，之后为分隔的“退出 Awake”和既有 Zero 退出。标签读取已解析的应用语言。
- IPC／左键／预设／退出复用 Rust lifecycle + blocking 协调入口。状态失效事件更新可见面板，隐藏面板释放订阅和展示时钟，旧响应不能覆盖新会话。
- “退出 Awake”先停止原生会话并取消到期，再合并持久化隐藏 Awake；停止失败不隐藏，保存失败不恢复会话。普通面板关闭保留入口，设置恢复不自动启用。
- 安全错误码与动作类型通过 snake_case snapshot 明确传递，面板显示本地化错误，原生动作失败通过宿主 rfd 对话框反馈。

## 自动检查

| 检查 | 结果 | 本次本地记录 |
| --- | --- | --- |
| `pnpm test` | 344 passed，0 failed | `/tmp/zero-awake-frontend-tests-final.log` |
| `pnpm build` | 通过 | `/tmp/zero-awake-build-final.log` |
| build graph budget | findings / forbidden eager imports 均为空 | `/tmp/zero-awake-build-graph.json`，未覆盖历史 snapshot |
| `pnpm icons:validate` / `pnpm test:icons` | 通过，图标测试 8/8 | 同时包含在完整前端回归 |
| `cargo fmt --check` / `cargo check --locked` | 通过 | `/tmp/zero-awake-rust-check-final.log` |
| 完整 Rust 串行回归 | 336 passed，0 failed，2 ignored | `/tmp/zero-awake-rust-tests-final-serial.log` |
| 此后菜单模型增量回归 | 5 passed，含 4 个 Awake 菜单／几何单元用例及 1 个集成契约 | `/tmp/zero-awake-rust-menu-tests.log` |
| OpenSpec strict / diff whitespace | 通过 | `/tmp/zero-awake-openspec-final.log` |

首轮 Rust 沙箱执行为 227 passed、2 failed、1 ignored，失败涉及现有私有 pasteboard 与子进程超时；保留 `/tmp/zero-awake-rust-tests.log`。按项目规则沙箱外完整串行复测先为 335 passed，增加提前到期唤醒回归后为 336 passed；没有削弱或跳过原有测试来取得结果。

新增回归覆盖：读取响应乱序、隐藏时取消旧请求及错误、恢复读取、错误契约、退出 stop/hide 失败顺序、Awake action 白名单与所属 item ID、菜单顺序／勾选、可见性合并／重启反序列化／恢复不启用、提前 timer 唤醒保留剩余等待而旧 generation 不重试。

## macOS 原生桌面观察

`pnpm tauri dev` 在沙箱内因 `listen EPERM ::1:1420` 失败；获准沙箱外运行后编译并启动成功。CUA 无法绑定裸 dev 可执行文件，因此交互使用同源 debug `.app`，没有据此宣称 dev 全部交互验收：

```sh
pnpm tauri build --debug --bundles app --config build/navigation-smoke/tray-native.config.json
```

测试配置只令现有 400×500 tray 初始可见并展示 Dock 入口；产物为 ignored 的 `src-tauri/target/debug/bundle/macos/Zero.app`。日志：`/tmp/zero-awake-tauri-dev.log`、`/tmp/zero-awake-tauri-dev-native.log`、`/tmp/zero-awake-native-build-final.log`。交互通过 CUA；进程和诊断观察为只读命令。

- 中文和英文未运行／无期限／有限会话，均在真实 400×500 托盘中显示全部预设、完整 44px 主按钮及宿主底部动作，没有滚动操作。
- 首轮有限会话发现剩余行挤压第二排预设；已收紧 Awake 专属间距并重新截图，其他插件 CSS 未调整。
- 中文 main 的 920×660 展开／收起布局和 760×520 自动紧凑布局，英文 760×520 到期状态均完整可操作。小于 800px 时沿用宿主自动收起规则，不能手动强行展开。
- 托盘开启有限会话后 main 读取相同会话；运行中无期限→5 分钟直接替换，时间从替换重新开始。普通退出 Zero 清理本次归属 caffeinate。
- SVG 导出的 16/18/22/24px、1×/2× 亮暗预览已目视检查，见 `awake-icon-sizes.png`。这属于矢量导出观察，**不等于真实菜单栏亮暗外观验收**。
- CSS 颜色计算：labels 7.96:1、普通 preset 8.88:1、选中 9.93:1、active 5.89:1、primary 15.73:1、disable 4.51:1、error 8.77:1（按定义的前景／背景，未宣称已执行完整系统高对比度验收）。
- 键盘实测发现 native disabled 在 mutation busy 时令 WKWebView 丢失焦点；改为初次读取前 disabled、操作中 aria-disabled + 原有 ref busy gate 拦截重复动作。修复后 Tab/Shift+Tab 焦点可见，Space 关闭后焦点留在主按钮，Enter 再次开启；Shift+Tab 到 5 小时，Enter 替换会话且焦点保留，Tab/Space 关闭成功。见 `tray-keyboard-focus.png`。

### 真实五分钟测试

1. 首轮 13:06:03 UTC 开启（Zero PID 2189、child PID 2332），Escape 隐藏 tray 后超过五分钟 child 仍在。13:12:29 进程采样未见业务／UI 锁阻塞；13:14:45 正常退出清理了两者。失败记录保留，不计为通过。
2. 到期协调器加入提前 wall-clock deadline 唤醒时的重新等待；没有达到期限的当前 generation 保留 timer，过期 generation 不影响新会话。尚不能仅凭采样断言首轮异常的唯一根因。
3. 修复版本 13:15:37.075 UTC 开启五分钟（Zero PID 13741、child PID 13802）；tray 隐藏，main 从 Awake 转入设置，所有 Awake 展示面板隐藏。原生诊断于 **13:20:37.078 UTC** 记录 `expiry.result / succeeded`；13:20:59 child 已不存在，Zero 仍运行。返回工具读到 Normal、Elapsed 00:00、Enable caffeine，见 `main-en-expired.png`。
4. **全窗口隐藏复测通过**：13:22:46.233 UTC 从无期限替换为五分钟（Zero PID 18916、child PID 18956），Escape 隐藏唯一 tray 窗口，CUA 没有可观察窗口。**13:27:46.327 UTC** 诊断记录 `expiry.result / succeeded`；13:28:13 child 已不存在，Zero 仍运行。随后正常退出并重新启动，面板为 Normal、Elapsed 00:00、Enable caffeine，没有恢复之前会话。

收尾恢复跟随系统语言、main 920×660 和展开侧栏；状态栏可见性／折叠偏好没有被测试修改。最终键盘流程先关闭会话再正常退出测试 app，没有保留本次 caffeinate。

## 待验收边界

- CUA 对 `com.apple.systemuiserver` 返回 `timeoutReached`，隐藏应用没有窗口时返回 `noWindowsAvailable`。现有工具无法获取完整菜单栏画面与 status cell，所以没有实际点击原生右键菜单／左键、观察 native hover tooltip／局部高亮、切换系统亮暗模式或执行原生“退出 Awake”菜单。这些项保持未完成。
- stop/hide 的失败顺序与错误消息有源码／自动回归证据；未在实机故障注入 stop、visibility 写入或显示刷新失败，也未实际观察无可见面板的错误对话框。
- 未完成字体放大、多行错误及触摸设备实测。键盘主动作和时长替换已实测；CSS 已提供 focus、选中边框、busy、coarse-pointer 44px，以及无装饰动画、无每秒 live region；这些不能代替完整辅助功能验收。
- Windows 无设备。共享面板和现有单图标 fallback 保留；Windows 原生唤醒／线程归属／到期的设备结果不从 macOS 检查推导。现有 `SetThreadExecutionState` 的调用线程风险仍需独立 Windows 验证。
- 现有 macOS 异常 child 退出只更新 diagnostic health 的行为未扩大到本次会话语义重构。

## 截图

- `tray-zh-inactive.png`、`tray-zh-unlimited.png`、`tray-zh-finite.png`、`tray-keyboard-focus.png`
- `tray-en-inactive.png`、`tray-en-unlimited.png`、`tray-en-finite.png`
- `main-zh-finite.png`、`main-zh-collapsed.png`、`main-zh-minimum.png`、`main-en-expired.png`
- `awake-icon-sizes.png`

图像仅含本次 Zero 界面和生成图标，无用户文档、目录内容或真实数据。

## 任务勾选范围

自动／实现任务 1.1、1.2、2.1、2.3、2.4、3.1、3.2、3.3、4.1、4.2、4.3、5.1、5.2、5.7 对应上述源码、回归、截图与门禁证据。共 14/21。

1.3 的隐藏错误对话框实测、2.2 的原生点击集成验收、3.4 的放大字体／异常布局完整验收及 5.3–5.6 的完整设备验收保持未勾。5.4 的两次修复后真实五分钟流程已通过，但仍欠实际菜单栏亮暗视觉与点击区域观察，所以整项不勾。
