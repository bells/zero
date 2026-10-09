# 设置与状态栏高亮补充验收（2026-10-09）

范围：只实施 tasks 8–10 新增功能，保留工作区已有导航改动。原批次记录 `verification-2026-10-09.md` 不覆盖此次补充。本轮未提交、推送、发布、同步主规范或归档；未改变 File 引擎审批、签名策略或安装私人插件。

## 已实现的行为

- `main` 内切换 tools/preferences，复用 SettingsCenter 与同一组 host/preferences/status-bar controllers；显示“返回工具”，不创建第二个设置窗口或遮罩。
- 已访问工具保持挂载，输入、选择和滚动状态保留；设置首次打开不加载未访问工具。`hidden`/`inert` 隔离隐藏视图，PresentationActivity 经 useSurfaceActivity 暂停既有展示刷新；原生 File 队列不因视图切换取消。
- 设置分类、搜索及目的地保持 main 会话状态，首次常规。搜索定位只消费显式 focus target，避免随后重渲染把焦点抢回标题；遵循 reduced motion。
- 兼容 `show_preferences_window` IPC 转向 main 设置。Rust 保留最新 destination/revision，React 先监听再读快照，丢弃旧 revision，完成初始读取前显示加载面。main/tray/about 可以请求导航，只有 main 可以读快照。
- 删除原 preferences 窗口工厂、路由、capability 与原生 caller 许可。保留协议的 preferences 语义 surface/registry 保留名称，File engine 独立 capability 未扩大，about 保持独立窗口。
- macOS 保留单个组合 NSStatusItem；公开 NSButtonCell mask 在初始化抑制自动整组绘制，命中测试透明的子 NSView 绘制当前单元背景，Ø 对应整组。稳定 ID/generation 管理按压、直接动作、菜单和工具面，布局刷新重算，退出恢复 mask/移除 view。此段是实现说明，实际系统栏视觉验收仍未通过。

## 自动检查

| 检查 | 本轮结果 | 日志（本机临时路径） |
| --- | --- | --- |
| `pnpm test` | 341 passed，0 failed | `/tmp/zero-navigation-supplement-frontend-tests-final.log` |
| `pnpm build` | 通过；既有 PDF lazy chunk 大小提示保留 | `/tmp/zero-navigation-supplement-build-final.log` |
| Rust fmt/check locked | 通过；修正 NSControl 同名 method 后最终 check 通过 | `/tmp/zero-navigation-supplement-check-final.log` |
| 新增高亮模型 | 4 passed；局部/Ø、重排/移除、旧关闭、拖出/直接动作 | `/tmp/zero-navigation-supplement-highlight-model.log` |
| 新增 main 导航 | 2 passed；首次/晚监听/连续目标、序列化与 caller/非法目标 | `/tmp/zero-navigation-supplement-main-navigation.log` |
| Rust 完整测试 | 实施时未通过，提交前完整复测通过；失败历史保留 | `/tmp/zero-navigation-supplement-rust-tests-final.log`、`/tmp/zero-navigation-commit-rust-tests.log` |
| 最终 Rust lib 隔离检查 | 223 passed，1 ignored，1 filtered（明确排除下述已失败测试） | `/tmp/zero-navigation-supplement-rust-lib-isolated.log` |
| 16 个 Rust integration targets | 106 passed，1 ignored，0 failed | `/tmp/zero-navigation-supplement-rust-integration.log` |
| 独立 build graph | 通过；入口 277,523 bytes / gzip 85,428；最大 lazy chunk 795,338 bytes；无 forbidden eager imports | `/tmp/zero-navigation-supplement-build-graph.json` |
| OpenSpec 全部 strict | 22/22 通过；原有 zero-icon-system 缺主规范的 archive INFO 保留 | `/tmp/zero-navigation-supplement-openspec-all.log` |
| 本变更 strict / diff | 通过；额外扫描本变更新文件的行尾空白 | 最终命令输出 |

Rust 失败证据按原样保留：

1. 首轮沙箱完整运行 lib 为 222 passed / 1 failed / 1 ignored：既有 private pasteboard 测试无法访问原生剪贴板，文件进程测试当轮通过。日志 `/tmp/zero-navigation-supplement-rust-tests.log`。
2. 合法沙箱外串行复测 lib 同为 222 / 1 / 1：剪贴板通过，既有 `services::file::process::tests::direct_runner_preserves_argument_boundaries_and_bounds_output` 在 1 秒 deadline 返回 `FileConversionError { code: Timeout }`。日志 `/tmp/zero-navigation-supplement-rust-tests-unsandboxed.log`。
3. 定向复测与无构建竞争的完整串行复测仍失败：`/tmp/zero-navigation-supplement-process-retry.log`、`/tmp/zero-navigation-supplement-rust-tests-final.log`。未修改该测试、超时或进程实现，也未确定超时根因。
4. 完整运行在 lib 失败后不继续 integration，因此最终代码独立跑全部 16 个 integration targets；另外排除这个已失败用例检查其余最终 lib。隔离结果不代表完整 Rust 门禁通过，当时 10.1 保留未勾选。

测试 fixture preparation 未并发。build graph 写独立 `/tmp` 快照，未覆写 tracked 历史 evidence。React 质量复核覆盖状态保留、effect cleanup、隐藏焦点、懒加载和显式 IPC 类型；未新增 TS any 或通用依赖。

## macOS 真实应用交互

`pnpm tauri dev --config build/navigation-smoke/tray-native.config.json` 首次沙箱启动因 `listen EPERM ::1:1420` 失败（`/tmp/zero-navigation-supplement-dev.log`）；合法沙箱外启动成功（`...-dev-unsandboxed.log`）。当前 CUA 无法绑定裸开发可执行文件，因此后续交互使用同源码、生产 frontend dist 的本地 debug `.app`：

```bash
pnpm tauri build --debug --bundles app --config build/navigation-smoke/tray-native.config.json
```

配置仅让现有 tray 初始可见，文件位于 ignored build 目录。应用为 `src-tauri/target/debug/bundle/macos/Zero.app`；最终构建日志 `/tmp/zero-navigation-supplement-native-build-final.log`。这是本机 debug bundle 交互证据，不能当作 release 安装包、运行中的 tauri dev 或 Windows 证明。

通过 CUA 实际观测：

- 首次从 tray 点偏好，tray 收起，一个名为 Zero 的 main 直接展示设置；原生标题栏不变，没有 preferences 窗口。最终构建重新启动后再次通过。
- 返回工具、重新进入设置都在同一窗口。Launch 合成查询与选择保留；最终构建使用 `zero-navigation-final-synthetic` 重验并清空。设置搜索“语言”在返回工具/重新进入后保留。
- 最终构建点击“语言 常规”搜索结果后，焦点停在“跟随系统”语言控件；键盘 Tab 可继续导航，修正了初次 smoke 发现的标题抢焦点问题。
- 常规、状态栏、只读快捷键、各工具与 Extensions 页面均可达。语言临时切换 English 后恢复 Follow System；状态栏收缩临时切换后恢复展开。自启动原值未改变，未修改 extension 权限或安装状态。
- 临时隐藏当前 Launch 导航入口后，返回有效 Awake，工具计数 4/5；恢复 Launch 可见性后 5/5。保存反馈可见。
- 将原生 main 缩到约 762×538 logical pixels，工具自动紧凑，设置两栏独立滚动，返回工具可达；中英文布局正常。最终构建重新创建窗口恢复 920×660。当前 main 最小 760px，未实际进入 <680px 的分类/内容单栏流。
- File 用现有 docx 依赖生成只有无私人内容说明的 `/private/tmp/zero-settings-navigation-synthetic.docx`，原生 picker 接受一个队列项。切换设置/返回后队列项保留；既有未批准/未加载引擎阻止转换，本轮未更改策略或启用 debug engine fallback。仅移除该合成队列项，随后删除合成文件。
- 临时更改的语言、工具可见性、状态栏收缩均恢复；合成查询清空，工具恢复 Awake，测试应用退出。

## 未完成范围与任务回填

本轮完成 8.1–8.4、9.2、10.1、10.3，共 7/12 新增任务；整体 28/42。10.1 根据下方提交前完整复测补勾；原 tasks 1–7 勾选不变。

| 未勾选任务 | 已完成部分与剩余条件 |
| --- | --- |
| 8.5 | 设置内容复用、分类/搜索/语言/工具可见与保存路径已检查；系统自启动变更、原生错误注入、<680px 的两级返回和 reduced-motion 实际操作未覆盖，保留完整交互回归门禁 |
| 9.1、9.3 | AppKit adapter、model、编译和生命周期已接入；CUA 获取 SystemUIServer 返回 timeoutReached，当前接口不能观测真实状态栏单元。工具按下无整组闪亮、菜单/失焦清除、Ø toggle、hover/右键/修饰键、深浅色与缩放仍需原生视觉验证 |
| 9.4 | 非 macOS fallback 源码及现有跨平台契约测试通过；没有 Windows 设备，也未做本轮 Windows target compile，保留设备验收 |
| 10.2 | debug app 同窗口设置、首次打开、工具查询/有效选择及合成 File 队列保留通过；快速外部原生目标交接、实际转换中的作业、逐工具系统栏视觉与硬件矩阵未覆盖 |

未新增原生 status items，未用浏览器/编译结果替代上述设备证明；未将原批次未完成任务勾选。此记录与项目窗口地图说明当前源码，不宣称全部待办或发布门禁已完成。

## 用户要求本地提交后的复测

用户随后明确要求“把代码提交”。提交范围为完整 refine-tray-and-workspace-navigation 源码、测试、项目地图与 OpenSpec artifacts；无 push、tag、release 或 archive。

- `pnpm test`：341 passed，0 failed，日志 `/tmp/zero-navigation-commit-frontend-tests.log`。
- `pnpm build` 和独立 build graph：通过，日志 `/tmp/zero-navigation-commit-build.log`，快照 `/tmp/zero-navigation-commit-build-graph.json`，入口预算与上述最终快照相同。
- Rust fmt/check locked：通过；`/tmp/zero-navigation-commit-rust-check.log`。
- 沙箱外完整 `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1`：330 passed、2 ignored、0 failed。lib 224 passed/1 ignored，integration 106 passed/1 ignored，既有进程边界测试本轮通过。日志 `/tmp/zero-navigation-commit-rust-tests.log`。没有排除测试，也没有修改超时或断言；本次通过不抹去此前失败或证明超时根因已修复。
- 本变更及所有 OpenSpec strict、diff/暂存空白检查通过。只有文档和任务证据在复测后更新，源码未变。

自动门禁 10.1 据此完成；实际系统栏视觉、Windows 和其余完整交互门禁仍保留未完成。
