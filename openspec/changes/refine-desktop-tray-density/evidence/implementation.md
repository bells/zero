# 实施与验证记录

日期：2026-11-12。变更：`refine-desktop-tray-density`。实施分支：`codex/refine-desktop-tray-density`。实施验收阶段未提交或推送；维护者随后明确授权提交、合并到 `main` 并推送。发布、同步主规范和归档不在本次交付范围。

## 已实现

- File 空态改为一个连续 SVG 箭头，取消独立 1px 横线，避免基线错位。
- Launch 仍以原有两秒策略更新运行状态，但后台通过最多 24 个当前显示 ID 获取缓存状态，只合并 badge；不重新排名、不改变就绪文案、busy 状态或快捷键透明度。真实索引 revision 改变才进行正常结果协调，输入世代和显示 ID / revision 激活保护保留。
- 主界面及托盘 Launch 保持三列：图标、名称/路径、右侧操作/数字快捷键；文本省略，完整路径保留在可访问描述和原生 title 提示中。
- 宿主使用自然内容 wrapper 测高；宽度 400 逻辑像素，通常总高最多 500，小屏进一步限高。五插件的 tray-only 拉伸规则移除，托盘内容由宿主拥有唯一纵向滚动区。主窗口和专用 Launch/Paper 尺寸不受此规则限制。
- `begin_tray_layout` / `update_tray_layout` 使用显式对称 Rust/TS 数据契约。仅 tray 调用、原生可见性检查、宿主会话、递增世代、有限正尺寸、目的屏幕工作区限制、尺寸/位置失败回滚均在 Rust；前端队列单请求、合并、像素去重，隐藏/卸载断开观察，不自行无限重试。
- macOS Zero / 专用 Paper 原生定位允许既有 8 逻辑像素 caret 带上探，主体仍在菜单栏下方；真实图标水平锚定和 placement revision 保留。失效/已拔除屏幕的锚点丢弃，macOS 无锚点居中并清除 caret。
- Windows 主托盘点击保存原生图标 rect，由目标工作区限制位置；无锚点的 positioner 结果也再次夹取。没有据此声明 Windows 设备验证完成。

## 自动化与构建

- `pnpm test`：492 passed，0 failed。包括原有调度/IME/快捷键测试，以及新增后台 badge 合并、显示项身份、布局请求合并/失败/卸载测试。
- `pnpm build`：通过，full profile 仍包含五工具。
- `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json`：通过，没有覆盖 tracked 历史性能证据。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo check --manifest-path src-tauri/Cargo.toml --locked`：通过。
- Rust 增加自然高度/500上限/小屏、调用者与 serde、过期会话/世代、caret 带/负坐标/任务栏夹取、30 条索引中按指定显示 ID 获取状态的回归。
- 完整 Rust 测试沙箱内保留原始失败：Vision 双语识别、私有 pasteboard PNG round-trip、File timed child process。未修改或弱化这些测试。沙箱外 `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1` 完整串行通过：共 464 passed、3 ignored（lib 为 352 passed、2 ignored，另有一项 integration ignored）。
- 严格 OpenSpec 校验、文档链接及空白检查另行执行。本记录的自动化结果不能替代真实设备验收。

## 浏览器真实 Hook 夹具

通过 Vite 加载实际 hook / view / CSS，用受控 IPC 回应模拟原生边界；测试结果由页面内断言输出，再由浏览器工具观察。它不是原生托盘测试。

- `tests/fixtures/tray/layout.html`：7 项通过，覆盖短内容收缩、延迟 shell-message 增/删重测、插件切换新会话、长内容限高、单宿主滚动、卸载清理。
- `tests/fixtures/tray/launch.html`：每个配置 5 项通过，覆盖连续 poll 不 rerun ranked search 或切换 loading、保持数字项身份、400px 长中英文路径右侧动作且不溢出、新查询竞争、poll 中按显示 ID 激活。
- 两种配置：`zh-CN` + `MacIntel`，`en-US` + `Win32`。platform 由夹具显式模拟，用于快捷键标签布局；不代表 Windows 原生测试。
- 第一次英文夹具使用不受支持的 `en` locale 而报超时；改用产品规定的 `en-US` 后同一夹具通过。产品代码未为夹具放宽 locale 类型。

## 原生观察与保留事项

- 实际执行过 `pnpm tauri dev`。沙箱禁止 `::1:1420` 监听，允许沙箱外执行后 Vite 和 debug Rust 均启动成功。
- 自动化最初连到 `/Applications/Zero.app` 旧四工具版本，该观察没有计作本次验收。退出旧实例后，对当前 debug 二进制在临时目录建立 `.app` 包装，保持 `com.watson.ztool`，连接 `localhost:1420` 的五工具构建；未替换已安装应用。
- 当前五工具构建主窗口已观察：Launch 右侧操作/数字快捷键与名称/路径布局；File 空态单箭头在 Retina 截图中连续、居中。File 此次源码调试的内置 provider 显示暂不可用；没有转换功能或引擎包验收，也没有改变引擎审批策略。
- 原生工具无法定位菜单栏触发图标。维护者在本轮明确回复“稍后，我自行验收托盘”；随后停止原生托盘尝试。五插件真实托盘高度/底部空白、长列表搜索和队列操作可达性、菜单栏箭头实际遮挡/点击/失焦/重开、多屏/混合 DPI 和 Windows 设备任务均保留未完成。
- 最终修正版已通过 `pnpm tauri dev -- -- --zero-tool awake` 启动，开发 URL 为 `http://localhost:1420/`；旧临时包装进程已停止，没有修改 `/Applications/Zero.app`。
- 源码目前实施 caret 带上探；是否需要采用已同意的贴近菜单栏下沿回退，必须由真实托盘验收确定，不能由源代码或主窗口截图宣称通过。

## 审查

独立只读审查发现并修复四个边界：动态 shell-message 不触发测量、运行奖励导致 top-24 集合变化而再次闪烁、拔除显示器后旧锚点把高度压至 1px、Windows positioner 未限制工作区。定向复核确认四项源码问题均已解决；没有把设备层面的未验证事项算作已通过。

## 维护者稍后验收

1. 打开 Zero 托盘，依次切换 Awake / Paper / Launch / Snap / File：短内容应结束于正常底部边距，长内容总高受限，仅一个内容滚动条。
2. Launch 静置多个两秒周期：就绪文案和数字快捷键不闪；切换/启动与快捷键位于右边，长路径省略。再测试输入、选择、Enter、⌘1（Windows Ctrl+1）。
3. Awake 展开/返回自定义计划，Paper 改变内容，File 展开说明/队列：顶部位置保持、底边变化，所有操作可达。
4. 检查主体与菜单栏下沿的距离、caret 是否可见/对准图标，重复点击、失焦关闭和重开。若上探被裁切或影响交互，记录后切换到已接受的下沿回退。
5. 在可用 Windows / 多屏 / 混合 DPI 环境检查屏幕边缘、显示器移除、任务栏方向与缩放；未执行前保持任务未勾选。

## 状态栏图标放大跟进

维护者反馈前述验证“基本没问题”，随后截图指出 Zero 状态栏图形偏小；这不作为多屏、Windows 等未执行专项的通过证据。

原生派生位图与 macOS 合成画布从 18px 增至 22px，22pt 单元格宽度、点击范围、caret 锚点和矢量身份不变。七个派生图标全部由现有 Tauri SVG 渲染脚本重新生成；没有放大旧位图。由于 pinned tray-icon 会把 NSImage 强制设为 18pt 高，宿主在初建及每次图标更新后同步恢复 NSImage 的 22pt 高和完整分组宽度，避免仅改位图导致图形仍小、列距与点击单元不一致。Zero 的 alpha 可见范围从 12×16 增至 16×18，Paper 从 14×12 增至 18×16，Awake 从 15×13 增至 19×16，Launch 从 14×14 增至 18×18，Snap 从 12×12 增至 16×16。所有图标仍有透明外边缘，Awake 开/关外框一致。

`icons:validate`、8 项 `test:icons`、Rust status-bar 模块测试与 `cargo check --locked` 通过。最终真实菜单栏大小、浅/深色外观与点击效果仍由维护者观察确认。

## 提交前复查

维护者明确请求提交、合并到 main 并推送。提交前重新执行前端全量测试（492 passed）、build、bundle 检查、图标验证、Rust fmt/check 与 OpenSpec 严格校验（45 passed）。Rust 首次完整串行回归中已有 File direct-runner 测试超时（原限时 1 秒），非 PTY 单独复查也超时；合成复现显示直接新脚本启动耗时 1.399 秒，而显式 shell 执行为 0.012 秒。保留失败记录，不据此断言唯一原因，也未修改或弱化限时。原测试在 PTY 下按原参数通过；完整 PTY 回归随后发现并同步一处仍断言 18px 的状态栏集成测试（透明/单色检查保留），最终全套 464 passed、3 ignored。GitHub 直连超时后，使用维护者提供的本地代理成功读取远端 main。
