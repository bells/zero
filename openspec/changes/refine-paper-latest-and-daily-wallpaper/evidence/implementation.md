# Paper 最新预览与每日壁纸实施记录

日期：2026-11-01。范围：`refine-paper-latest-and-daily-wallpaper`。源码与自动检查已实施；macOS 原生交互和 Windows 设备验收仍未完成。提交、推送按维护者明确授权进行；本变更未发布、同步或归档规范。

## 源码行为

- `bingWallpaperModel.ts` 区分 latest-following 与主动历史浏览。进入可见 Paper 会话时重置，刷新沿用当前意图；普通 focus 不创建会话。离开／隐藏后的请求 gate、会话 generation 和预览 Blob/token 清理继续生效。
- 快捷面板新增“回到最新”“立即刷新”；仅前者改变选择意图。显式刷新绕过五分钟成功复用，并合并进行中的网络请求。两者不打开每日开关，也不解除手动保护。
- Paper 插件通过 `loadSettings` 提供即时保存的每日开关、搜索定位、运行限制和详细状态。默认关闭；失败保留最后确认值；保存成功后应用失败不会回滚开关。
- Rust `automation_store.rs` 拥有独立版本化 `paper-state.json`，保留旧图片 index 和未知文件。损坏、未知版本、不可读状态阻止自动应用并保留原文件。状态包括最近成功应用、当日手动保护、带 slot 的 pending intent、恢复保护 slot 和受控文件 ownership。
- `automation.rs` 统一手动／自动应用队列。在 OS 调用前持久化 intent，校验完成后紧邻 setter 再检查授权；阻塞 OS 调用在 worker 中运行。关闭／禁用不等待正在执行的系统调用，也不把已发生的成功改写为取消。OS 成功但保存失败返回 `paper.applied_state_unsaved` 并阻止后续自动应用；无法确认的旧 intent 也不能被普通手动请求抹除。
- 最多三个已登记的 applied 副本，排除最近应用和不确定应用可能引用的文件。图库淘汰不删除当前副本；未登记的同名文件不会被覆盖。第三个 slot 用于崩溃恢复时仍留出安全目的地。
- `automation_runtime.rs` 负责启动、北京时间市场日变化、resume 和最多 60 秒 reconciliation；正常成功后六小时检查，未发布（包括开启后使用旧图及旧图去重）三十分钟检查，可恢复失败按 1／5／15／30 分钟退避。wall clock 与 monotonic 时间共同检测休眠／时钟跳变，只检查最新一次。
- 手动成功应用历史图保护至下一个中国午夜，跨重启保留。普通刷新、插件 disable→enable 不解除；明确 off→on 清除并请求最新可用图。相同最近成功 ID 不重复调用系统。
- 共享 `power_events.rs` 由订阅租约持有原生 observer；Awake 仍消费通用 power revision，Paper 仅消费独立 resume revision。电量百分比变化不会变成 Paper 联网触发；通知不可用时仍有 reconciliation。
- 新 IPC 为 `get_paper_settings`、`update_paper_settings({input:{autoChangeDaily}})`、`get_paper_runtime_snapshot`、`check_paper_wallpaper_updates`。Rust/TS camelCase、phase union 和可选字段对称，仅允许 tray/main/paper 调用；没有扩展 File engine 或隔离插件 capability。既有 preview token/raw bytes 保持兼容。
- `zero://paper-state-changed` 仅发送 revision；可见视图先监听再读取权威 snapshot，忽略旧 revision。状态通知失效重读 metadata，不触发网络循环。自动任务不依赖 WebView 保活。

## 自动验证

环境：Node v24.20.0，pnpm 10.33.0。

- `pnpm test`：404 passed，0 failed。
- `pnpm build`：full 构建通过；Vite 仍有既有 File 大 chunk 提示。
- `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json`：通过，没有覆写 tracked 历史文件。
- `ZERO_BUILD_PROFILE=core pnpm build`：通过，0 tool modules，Paper 设置未进入包。
- `ZERO_BUILD_PROFILE=standard pnpm build`：通过，Snap/Awake/Paper/Launch。
- Rust full 的 fmt/check/test 及 core/standard feature check 已执行。最终全套 426 passed、0 failed、3 ignored（原有 ignored 保持不变）；没有弱化或跳过失败测试。
- 首轮沙箱全套 Rust 测试：304 passed、2 failed、2 ignored。失败分别是 `native_png_clipboard_round_trips_on_private_pasteboard` 的原生剪贴板不可用，以及 `vision_recognizes_synthetic_bilingual_edges_and_blank` 的 `RecognitionFailed`。沙箱串行定向复查仍失败；在允许原生 API 的环境中，两项定向测试和随后全套测试均通过。首轮日志保留在 `/tmp/paper-cargo-test.log`，定向日志为 `/tmp/paper-pasteboard-recheck.log`、`/tmp/paper-vision-recheck.log`，最终日志为 `/tmp/paper-final-all-rust.log`。
- 测试覆盖：缓存默认／历史意图、旧 revision、token/Blob 生命周期；市场日/午夜/非法与未来日期；状态损坏和写失败；去重／跨重启／手动保护；OS 已开始时关闭、排队取消；旧检查合并后的新开启意图；退避不被 resume 绕过；monotonic 休眠暂停时的 wall-clock fallback；不确定应用恢复与未知同名文件保护。
- `openspec validate --all --strict`：39 passed、0 failed；既有其他变更的归档提示不属于本次失败。相关七个 Markdown 文件的 40 条本地链接均有效，`git diff --check` 通过。
- 独立只读审查发现的开启意图合并、power/resume 混同、OS 边界取消、旧图等待间隔及 next-check 状态问题均已处理；没有延期的小项。设备行为、profile 实际产物和修改中的恢复实现由实施者负责验证，设备限制见下。

## 设备证据与未完成事项

### macOS：任务 6.4 保持未完成

执行了 `pnpm tauri dev`。第一次因沙箱禁止本地 `::1:1420` 监听而失败；允许本地开发服务器后，Vite 启动，Rust 编译完成并运行 `target/debug/zero`。原生自动化通过 bundle ID 连接超时（`timeoutReached`），通过 debug binary 路径连接返回 `Invalid app`，未获得可核实的 Paper 窗口状态。

因此没有把启动日志当作 UI 或壁纸验收；尚未验证各入口重开、键盘／窄窗实际布局、真实启用切换、后台隐藏、实际睡眠恢复、网络恢复和手动当日保护。没有通过自动测试改动用户桌面；Paper 自动化测试使用临时目录、合成图和 fake setter。开发进程已结束。

### Windows：任务 6.5 保持未完成

本环境没有可用 Windows 设备。窗口／设置、真实桌面切换、resume、插件启停与持久化仍需单独验收。编译、source contract 和 macOS 测试不能替代此项。

本轮不新增 Linux／移动端或逐屏／Space／锁屏支持承诺；系统适配器原有范围不变。源码不是已发布安装包或线上部署证据。

## 规范整合顺序

本变更的两个补充能力与任务分工：`paper-latest-presentation` 对应第 1、5 组和展示事件；`paper-daily-wallpaper` 对应第 2、3、4 组及设备验证。以后获得授权整合时，先整合 `add-bing-wallpaper-plugin` 基线，保留其历史导航 requirement 的四个既有 scenario，细化 `Plugin opens with multiple entries`、`Selection survives refresh` 为会话／用户意图规则，再整合本变更两个补充 capability。本轮没有编辑旧 delta，也没有 sync/archive。

## 2026-11-01 截图反馈跟进：紧凑工具栏与最大化重排

维护者提供原生截图，要求最新／刷新操作放到箭头旁、最大化时图片及时撑开，并适当增加 Paper 独立快捷窗高度。

- 六个操作统一使用现有 `lucide-react` 图标，顺序为下载、应用、较早、较新、回到最新、立即刷新；保留中英文 accessible name、原生 title 提示、键盘焦点和刷新 busy 反馈，删除图片上方独立按钮行。
- 独立 Paper 快捷窗由 400×300 改为 400×400，继续使用宿主定位／工作区夹取。托盘和主窗口的尺寸规则不变。
- 在真实 Paper React 组件和模拟 IPC 的测试页中复现 WebKit 的循环尺寸计算：1000 宽测试窗的 Grid 第一列为 418.59375px，预览仅 167.5px；扩到 1600 后列宽 763.59375px，预览仍约 167.5px，随后逐帧增长。Chromium 不出现该现象。
- 根因是 Grid stretch、按钮自动宽度／aspect-ratio 和流内图片百分比高度互相影响。预览现在使用明确的 100% 宽度、`align-self: start`，图片绝对定位在预览框内，不再参与内在尺寸计算。首帧同时更新宽与 16:9 高度；不添加 resize 监听、网络请求或额外图片解码。
- 新增 `tests/fixtures/paper/panel.html` 和 `tests/browser/paper-panel.mjs`。修复前，WebKit 首次列宽断言及工具栏 SVG 断言失败；原生尺寸断言也先以 300≠400 失败。修复后 Chromium/WebKit 均通过：中英文、历史导航、键盘回到最新、强制刷新、1600/800/1400/1000 首帧列宽／比例、320/360 托盘无横向溢出、400×400 Paper 正常内容无额外滚动条、无 console/page errors；缩放不发起刷新，导航／刷新不应用系统壁纸。
- Browser 插件未安装，复用了本机已有且与浏览器二进制匹配的 Playwright 1.61.0，未安装依赖。执行方式：启动 Vite 后，以 `PAPER_PLAYWRIGHT_MODULE` 指向已有 Playwright 模块运行 `node tests/browser/paper-panel.mjs`，WebKit 额外设置 `PAPER_BROWSER=webkit`。也可用 `PAPER_BROWSER_PATH` 指定已有浏览器。输出默认位于 `/tmp/zero-paper-panel`，WebKit 本次输出 `/tmp/zero-paper-panel-webkit`。测试图片为本地合成图，没有读取或上传截图中的私人内容。
- 本次 `pnpm test` 404 passed；`pnpm build` 和 build-graph 预算检查通过；原生窗口三个定向测试通过。浏览器结果不替代 macOS 原生最大化动画或 Windows 实机验收，6.4／6.5 继续保持未完成。

本次 Rust 全套回归 426 passed、0 failed、3 个原有 ignored；fmt/check 通过。更新后的 `pnpm tauri dev --no-watch` 也已编译并启动，但原生连接仍返回 `timeoutReached`，未据此提升设备验收状态。

随后按维护者反馈，将“最近检查：时间”整体移到图片日期行的 Bing 右侧，以较弱的普通文字显示；400 宽度下同行，窄窗自动换行。正常状态不再生成底部重复时间／空状态块；详细设置仍保留检查时间，未发布和错误反馈仍独立呈现。保留“最近检查”语义，不把实际检查时间称为图片更新时间。Chromium/WebKit 的中英文、400 快捷窗、320/360 托盘、最大化首帧回归再次通过；前端 404 测试、构建和 build-graph 预算通过。本次未改动 Rust 或 IPC。

## 2026-11-01 截图反馈跟进：主窗口扩图与快捷窗间距

- 主窗口改为横向 Flex 媒体布局，说明区限制为 `clamp(200px, 25%, 320px)`，图片使用余下宽度；托盘的列宽策略不变。在 1600×900 的真实组件测试页中，1338px 内容区的图片从约 763.6px 扩至 1002px（约 75%），说明区 320px。
- 快捷窗内容从填充剩余高度改为按自然高度排列，顶部对齐；图片到日期行的实际间距由约 38.83px 降为 6px。400×400 窗口继续保留，图片比例和 Bing 右侧的最近检查时间不变。
- 新几何断言先复现图片占比不足和快捷窗约39px空隙。截图复核另发现 WebKit 缩放时 Grid 行高可能短暂保留旧值；主窗口采用 Flex 后，图片、说明区和容器高度在首帧同步。定向断言验证图片宽度填满可用媒体区、保持16:9、父内容高度不小于图片高度。
- Chromium/WebKit 均再次通过中英文和 1600/800/1400/1000 缩放、400 快捷窗、320/360 托盘、键盘／刷新行为；两种语言测得快捷窗间距均为6px，无 console/page errors。测试每种语言开始前恢复正常主窗口尺寸，避免把前一轮320px托盘宽度带入主窗口。
- 前端404测试、full构建、build-graph预算和 `git diff --check` 通过。此次仅修改 CSS、浏览器回归与本记录，未变动 Rust、IPC 或设备验收状态。浏览器截图使用合成图，位于 `/tmp/zero-paper-spatial-webkit` 与 `/tmp/zero-paper-spatial-chromium`。

## 2026-11-01 快捷窗最终高度收敛

图文间距收紧后，400 高度留下了约55.44px底部空白。实际测量400/360/350三种高度：360时中英文底部均约15.44px，无内容溢出；350仅余约5.44px，侵占正常内边距。因此独立快捷窗从400×400调整为400×360，宽度、图文6px间距及其他surface不变。原生尺寸断言先以400≠360失败；更新后浏览器回归检查正常内容完整、底部留白不超过24px。Chromium/WebKit中英文与既有操作／缩放回归通过。此次只调整原生窗口尺寸及测试／记录，现有已创建窗口需随开发实例重启重新创建才能使用新尺寸；不提升原生设备验收状态。

## 提交前复查与性能记录更正

维护者明确要求提交并推送本次全部 Paper 改动。提交前改用遇错即停的命令流程复核，发现先前串行命令没有传播 build-graph 的非零退出码：此前将预算检查写成通过的记录不准确，以本节为准。修复前入口静态体积为287,680字节，超过285,000字节预算2,680字节；并无 forbidden eager imports。

将 Paper 大型设置／状态翻译从 eager 插件 descriptor 移入按需面板，由 `BingWallpaperPluginPanel` 在打开面板时绑定翻译；descriptor 仅保留轻量名称、描述和设置搜索条目。预算不变。重新构建后首包282,639字节、gzip 87,243字节，build-graph findings为空，命令退出0。前端404测试、full构建、严格OpenSpec验证通过；浏览器 fixture 也改用实际插件 loadPanel 入口复查。

本次 Rust 首轮全套中，既有 `services::file::process::tests::direct_runner_preserves_argument_boundaries_and_bounds_output` 在并行负载下触发 conversion deadline，313 passed、1 failed、2 ignored；保留日志 `/tmp/paper-commit-cargo-test.log`。未修改该测试或实现；定向串行复查通过，随后串行完整回归426 passed、0 failed、3个原有ignored，日志 `/tmp/paper-commit-rust-serial.log`。fmt/check通过。此前沙箱原生 API 失败记录继续保留。

源码提交与推送不代表设备／发布验收完成：6.4、6.5仍未勾选，不同步或归档规范。
