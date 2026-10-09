## Context

动机与用户截图对应关系见 [proposal.md](proposal.md)。以下为原提案建立时的源码约束，已有导航增量的实现范围见 [验收记录](evidence/verification-2026-10-09.md)；本轮设置承载与高亮实现及未完成门禁见 [补充验收记录](evidence/verification-supplement-2026-10-09.md)：

- `TrayPanelApp` 与 `MainWindowApp` 在 `App.tsx` 共享文字卡片选择器；卡片目前用彩色健康条代替工具图标。托盘有品牌标题、副标题、数量徽章及固定系统操作。
- 主窗口 CSS 使用 220px 侧栏，720px 以下将侧栏和工作区堆叠。宿主 `main-workspace-heading` 与 `FilePanel` 的标题同时存在，后者还有 `LOCAL / SESSION`。File 的格式、provider、队列及隐私说明属于有用内容。
- `toggle_tray_quick_panel` 显示后设置焦点，尚未注册 tray 的失焦隐藏。Paper/Snap 菜单已有延后重查焦点模式，宿主 `tool_windows` 协调瞬态窗口，`surface_activity` 负责可见性事件。
- macOS 将工具与最右侧 Ø 合成一个 22pt/单元的原生项。`grouped_status_item_ids` 与单元矩形用于点击路由；整个项统一 `.tooltip(PRODUCT_NAME)`，因此不能通过给“每个 tray icon”设置名称解决截图二。
- 现有 Tauri/tray-icon 暴露 Enter/Move/Leave 与 `with_inner_tray_icon`；项目已依赖 macOS `objc2`/AppKit。本地绑定提供公开的 `NSView.addToolTipRect:owner:userData:`。API 存在不是区域提示已在 Zero 实机验证的证据。
- 侧栏状态适合前端 `zero.preferences.v1`，与 Rust `status-bar.json` 的系统栏收缩状态是两个独立概念。插件面板仍需要懒加载，不能为了获取图标 eager-import 面板。

- 补充实施前：`show_preferences_window` 创建独立 `preferences`；`PreferencesSettingsCenter` 已有分类、搜索、两栏/窄布局与即时保存。本轮已移除独立设置窗口外壳并嵌入 main。
- 锁定依赖 `tray-icon 0.23.1` 的 macOS `on_tray_click` 调用整个 `NSStatusBarButton.highlight(true)`，mouse up 再清除。工具共用该按钮，更新 tooltip 或只在 mouse up 重绘都不能避免按下时整组闪亮；需要验证原生按压与菜单 tracking 的局部适配。

## Goals / Non-Goals

**Goals:**

- 定义能够承受 1、5、20、50 个可见插件的布局，不随工具数增加托盘导航高度。
- 让导航和工作内容的标题、选中状态、焦点、工具健康状态各自有明确职责。
- 将生命周期行为留在原生宿主，将导航展示与侧栏偏好留在 React，避免按插件 ID 编写宿主分支。
- 确保隐藏面板不会取消 Rust 已接收的后台作业，不发生 blur 后错误重开或旧计时器隐藏新面板。

**Non-Goals:**

- 不增加插件分类、搜索、排序/重排、固定收藏或新的第三方图标协议。
- 不更改截图、转换、引擎审批或独立 Paper/Launch/Snap 工具面的核心交互。
- 保留关于窗口和现有设置内容/持久化语义，仅改变设置承载与导航；不增加独立 macOS 状态栏项，不宣称 Linux/mobile 原生支持。

## Decisions

### 1. 托盘采用单行工具导航，工作内容占据剩余空间

布局示意（示意名称不是最终产品文案）：

```text
┌─────────────────────────────────────────┐
│ Zero                           5 个工具 │
│ [‹] [Awake] [Paper] [Launch] [Snap] [›] │ ← 实际显示对应图标
├─────────────────────────────────────────┤
│ Zero File                     PDF↔DOCX │ ← 选中的插件内容标题
│ 引擎能力、文件入口、任务或其他插件内容    │
│ 内容区独立纵向滚动                      │
├─────────────────────────────────────────┤
│ [偏好]        [打开 Zero]        [更多] │
└─────────────────────────────────────────┘
```

保留原生 400×500 默认窗口与必要的工作区，不扩大托盘以容纳更多工具。品牌头压缩为一行，去掉重复的产品定位副标题，数量退为辅助信息。导航目标高度 52px，图标点击区至少 44×44px，图标约 20px。默认五工具在 400px 宽时不需换行；可用宽度不足时只在这一行滚动。

将共享 `PluginPicker` 拆成宿主导航组件与小型导航 hook。数据由当前可见插件集合产生，不包含禁用或被隐藏的入口。滚动区域采用原生 `overflow-x: auto`，触控板水平滚动和触摸手势直接使用浏览器能力；两端按钮在溢出时出现，到边缘禁用。键盘 Tab 逐项进入、Enter/Space 选择，焦点项和选中项均自动滚入视野。不拦截垂直滚轮，不要求按住鼠标拖动来发现工具。

工具数量、宽度、语言或可见性改变后通过 `ResizeObserver`/滚动事件更新溢出状态；组件卸载时释放 observer/listener。工具被隐藏后沿用当前有效选中项回退逻辑。底部动作固定，只有插件内容区域纵向滚动。非 macOS 的 `StatusBarFallbackRow` 保持直接动作能力，可改为同样紧凑的一行，但不能将“插件选择”与“直接执行状态栏动作”混成一次点击。

**取舍：** 双列文字卡片随插件数量线性占用高度；多行图标仍会挤压内容；分页要求额外切换才能定位。原生横向滚动加按钮实现成本低，也能兼顾鼠标和键盘。任意数量的发现效率不是本变更承诺，未来需要分类/搜索时单独规划。

### 2. 图标由组合层映射，健康状态不再充当图标

优先复用 Snap/Awake/Paper/Launch 的现有品牌 SVG 和 `StatusBarGlyph`；Zero File 使用已有 `lucide-react` 的文件图标，未声明图标的扩展使用现有 extension 资产。只在宿主 frontend descriptor 增加可选的导航图标展示字段，类型显式定义，允许 SVG 资产/现有 glyph 与 Lucide 图标的统一渲染。

`src/core/` 仅依赖抽象展示类型，具体映射来自 `bundledPluginModules`；不引入插件间导入或修改跨语言 manifest。图标必须相互可辨认，不能五个工具都使用同一形状不同颜色。

选中状态用背景与边框配合 `aria-pressed`，键盘焦点独立可见。运行/错误状态用小型语义指示及可访问描述，不能只靠颜色。每个入口始终有完整 `aria-label`，hover/focus tooltip 显示名称，tooltip 通过 portal/固定定位避免被滚动容器裁切；无需新增组件库。中英文长名称只在展开列表截断，提示仍完整。

### 3. 主侧栏展开为列表，收缩为图标轨道

```text
展开（约 192px）            收缩（约 64px）
┌──────────────────┐       ┌──────┐
│ 工具          [«]│       │ [»]  │
│ [图标] Zero Awake│       │ [图标]│
│ [图标] Zero Paper│       │ [图标]│
│ [图标] Zero File │       │ [图标]│
│ ……纵向滚动       │       │ ……   │
└──────────────────┘       └──────┘
```

展开行采用图标+名称，去掉每项的产品说明副标题和重复卡片框。行高至少 44px。侧栏头的收缩按钮始终可见，提供本地化的“收起工具栏/展开工具栏”、`aria-expanded` 与 `aria-controls`。工具区独立纵向滚动；收缩后继续支持 tooltip、焦点、选中与健康指示。

在 `AppPreferences` 增加 `mainSidebarCollapsed: boolean`，旧数据缺少字段或类型无效时默认为 false。使用既有读写和通知机制，保存失败保留当前会话的布局并提供非阻断反馈，不覆盖已有 language、visibleTools 或 launchAtLogin。该字段不是 Rust IPC，不写入 status-bar settings。

主窗口 800px 及以下自动采用紧凑轨道（原生最小宽度为 760px，720px 断点在当前桌面窗口中不可达），避免当前导航与内容上下堆叠。自动布局只影响 effective state，不覆写用户在较宽窗口保存的偏好；回到较宽布局时恢复偏好。短窗口里仅工具列表滚动，顶部收缩控件仍可达。最小窗口尺寸和实际断点在本地 smoke 中调整，保持此行为契约。

**取舍：** 完全隐藏侧栏会让切换工具再多一次操作；抽屉适合更小触摸设备，但当前是桌面工具。常驻紧凑轨道保留工具可发现性，同时把宽度让给工作区。

### 4. 可见工作区标题由插件面板统一负责

移除宿主 `main-workspace-heading` 的可见“插件工作区”、插件名称及静态绿色说明。宿主 section 保留可访问名称，避免将介绍文案伪装为成功状态。插件面板自己的标题是唯一可见标题；不需要新的 Rust/TS 跨端契约，也不需要为了隐藏标题给所有插件增加条件参数。

Zero File 保留 `Zero File`、格式/队列统计及实际 provider 可用性，删除 `LOCAL / SESSION`。将主工作区作为布局槽位，插件自身负责内容表面，消除两层大面板边框/内边距。保留 drag 区、输入/输出方向、任务进度、错误、取消和底部隐私说明，内容紧张时允许局部滚动，主要操作不能移出可访问范围。

通用扩展/无 view 插件、lazy loading/error fallback、空集合也要有一个明确可见名称和本地化说明。第三方扩展的 iframe/WebView 内部标题无法由宿主保证，宿主不额外添加重复标题，不修改第三方内容。检查其余四个内置面板及专属窗口，确保删除宿主头后没有失去必要的身份信息。

**取舍：** 隐藏 File 自身标题会让托盘和其他独立承载场景额外判断是否补标题；新增统一 workspace-header API 又扩大插件协议。本次让既有面板继续持有标题，解决宿主重复问题。

### 5. tray 的失焦隐藏由原生宿主处理

增加聚焦于 tray 的生命周期服务，在 setup 对已存在的 tray 注册一次窗口事件。失焦后短暂延后（初始约 120ms）重查可见性、焦点与本轮展示 generation，满足条件才调用现有 `hide_surface`。使用 generation 防止旧任务隐藏刚重开的面板，也防止第二次点击 Ø 时“blur 先隐藏，toggle 又打开”。内部菜单点击不产生窗口外部失焦，不通过 DOM document click 判断其他应用。

打开 tray 时协调隐藏现有 Paper/Launch/Snap 瞬态面；打开主窗口、偏好、关于或其他工具时显式隐藏 tray。只影响瞬态面，不隐藏 main、pin 或 File engine。隐藏仅改变 surface activity，保持插件选择和原生任务状态。

由原生操作持有按调用窗口关联的 RAII dialog guard，只在文件选择/保存这类真正将焦点移交 OS 的时段暂停 tray blur dismissal。复用现有原生对话框入口，不让前端宣称自己长期“忙碌”就阻止收起。成功、取消、错误及 worker failure 均释放 guard；关闭后根据当前窗口焦点/外部激活状态决定保留或隐藏，不主动抢回其他应用焦点。guard 是原生生命周期状态，不能因为暂停 dismissal 而禁止后台转换。

Escape 先关闭 tray 的更多菜单/当前局部弹出层，未被消费且没有 OS modal 时隐藏 tray。提供单用途 `hide_tray_quick_panel` 服务/command，command 校验调用窗口为 `tray`，返回 `Result<(), String>`；前端 `appWindows.hideTrayQuickPanel(): Promise<void>` 调用 `invoke<void>("hide_tray_quick_panel")`，错误走现有反馈。注册 invoke handler 并核对 capability/caller checks，禁止隐藏 File engine 或任意窗口。

**取舍：** 单靠 React blur 不能统一处理 OS 对话框和原生状态栏点击；立即 hide 会与 toggle 竞态。复用 host service、短延迟重查和作用域 guard 能限制此改动，不需要全局鼠标监听或新的系统权限。

### 6. macOS 分区提示保留组合状态栏资源

使用现有 `grouped_status_item_ids` 的顺序和相同单元边界生成 tooltip 区域与名称。优先为 `NSStatusItem.button` 的本地 bounds 注册公开的 AppKit tooltip rectangles，覆盖每个工具和 Ø，清除统一全区域提示，避免提示重叠。通过小型 macOS-only adapter 保留 tooltip owner/字符串和 tag，所有 AppKit 访问在主线程，新增绑定 features 仅限 NSView/NSStatusItem/NSStatusBarButton 等必要类型。工具名称来自已存在的 snapshot title，Ø 名称为 Zero。

tooltip 区域用本地逻辑坐标；不能直接把 Tauri 全屏物理 rect 写入 AppKit local bounds。单元数量、collapsed、可见性、语言及插件 lifecycle 改变时先清除旧 tag 再重建，资源移除/退出时释放 owner。状态图标更新如果不改变边界可以保留区域，但名称变化必须同步。提示实现不更改现有点击/右键菜单 target，不替换 tray-icon 的 tracking view/delegate。

第一项原生工作是验证这一公开 API 与 tray-icon 现有 tracking 的兼容。若测试发现区域注册被宿主 tracking 刷新清掉，局部采用现成 Enter/Move/Leave + 当前单元变化时 `set_tooltip` 的适配；只有实际跨单元移动、停留及可见 tooltip 更新均满足规范才接受该替代。两条路径都不允许退化为永远显示 Zero，也不因此恢复独立工具 tray items。遇到当前依赖无法满足时记录阻塞，不声称工具提示已完成。

Windows 等回退平台只保留主 Zero 提示，tray 的 action row/导航提供工具名称，不制造不存在的系统栏子单元。

### 7. 设置作为 main 内的完整视图

参考本轮补充截图二的空间关系，不照搬其账户/权限等业务。main 有 `tools` 与 `preferences` 两种宿主视图，设置模式用设置分类栏替换工具列表，右侧展示当前设置页；保持一个原生标题栏，显示“设置”和明确的“返回工具”入口，不叠加模态遮罩或第二个窗口。复用 `PreferencesSettingsCenter`、现有设置页、搜索索引和反馈逻辑；沿用当前样式体系与中英文。窄窗口复用分类→内容的单栏流，区分“返回设置分类”与“返回工具”，搜索与内容分别滚动，主要入口至少 44px。

工具模式及设置模式共享同一份 host/preferences/status-bar controller。已访问的工具子树保持稳定挂载，用 `hidden`/`inert` 隔离焦点及访问树，并通过 `PresentationActivity`/`useSurfaceActivity` 暂停不可见时的展示活动；保留插件选择、导航宽度、滚动、待选文件/查询/未提交输入。首次直接打开设置时不加载未访问的工具面板。Rust 已接受的任务继续运行。返回时恢复有效工具与焦点；如果在设置中隐藏/禁用/移除该工具，则使用现有有效选择回退。设置目的地和搜索在当前 main 会话中保留，首次进入默认常规，不为视图位置新增持久化格式。

main 内点击偏好仅切换 React 视图；tray 或其他原生入口沿用 command 名称 `show_preferences_window(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), String>` 与 `appWindows.openPreferencesWindow(): Promise<void>` / `invoke<void>("show_preferences_window")`，Rust 校验 main/tray/about caller 后显示/聚焦 main 并交接 preferences 目标。现有 `show_main_window` / `openMainWindow` 请求工具视图，内部原生动作使用 `open_main_window(app)`。薄 command 将协调委托给宿主服务；目标枚举 Rust `MainWindowDestination` 用 `serde(rename_all = "camelCase")`，TS 对应 `type MainWindowDestination = "tools" | "preferences"`，通知对象使用 Rust `MainWindowNavigationRequest { destination: MainWindowDestination, revision: u64 }` 与 TS `interface MainWindowNavigationRequest { destination: MainWindowDestination; revision: number }`，两端显式定义同名字段。

原生服务保留最新目标并单调增加 revision，向 main 定向发送事件；React 先注册 listener 再读取仅允许 main 调用的 `get_main_window_navigation` 快照，丢弃旧 revision，在初始读取完成前显示加载面。这样首次创建、快速连续 tools/preferences 请求和重新打开时都以最新目标为准，晚到快照不会覆写新事件。非法目标/调用者按既有边界拒绝，窗口创建、聚焦和交接错误可反馈到发起入口。正常路径不再创建 preferences，独立工厂/常驻路由/capability/caller 已移除。协议中的 preferences 语义 surface 和 registry 保留名称不变；File engine 仍使用原独立权限。

**取舍：** 弹窗保留多窗口管理成本，模态设置会挡住主内容并引入关闭层级。主窗口内完整设置视图符合用户参考，既有设置逻辑可直接复用；保留工具上下文与可靠跨窗口交接是实施重点。关于窗口维持当前独立形态。

### 8. macOS 高亮与点击单元使用同一几何边界

将“底部高亮”定义为图标下面的系统栏背景反馈，覆盖按压、原生菜单 tracking，以及现有工具面保持激活时的反馈；不新增持久的“当前工具”状态或底部装饰线。工具直接动作（如 Awake 开关）完成后释放按压反馈，后台运行状态仍由既有 glyph 表示。主 Ø 按压/面板激活允许覆盖整组；只剩 Ø 时覆盖当前项。工具高亮始终限定当前单元矩形，不叠加全按钮蓝底。

复用 `grouped_status_item_ids` 与点击/tooltip 单元几何，记录目标为稳定 item id，刷新布局时按当前可见集合重新解析；不保存会漂移的数组索引或物理坐标。按下、拖出取消、mouse up、工具面 show/hide/blur、菜单关闭、失败、收缩、移除和退出都收敛到确定的高亮状态。菜单或瞬态面使用关联目标/展示 generation，旧关闭事件不能清掉后续新目标。hover 只显示名称，不转为高亮或触发动作。

先验证公开 AppKit API 能否关闭组合按钮的自动整组 highlight，并通过宿主拥有的轻量单元背景绘制，在原生主线程保留局部按压与菜单反馈。现有 tray-icon mouseDown 会主动 highlight 整个按钮，需要证明适配在正确事件阶段生效，不发生一帧整组闪亮；不能把 mouse up 清除当作解决方案。adapter 不遮挡命中区，不破坏 template glyph、tooltip owner/tag、右键菜单 target 或 modifier 收缩行为，并处理浅/深色、系统对比度和 Retina 尺度。

当前适配使用公开 `NSButtonCell.highlightsBy`/`showsStateBy = NoCellMask`，在初始化即关闭自动整按钮反馈；子 `NSView` 仅绘制 0.28 alpha 的系统 selected-content 背景，`hitTest:` 返回 null 保留原 tracking。注册状态持有按钮/cell/overlay、稳定 ID 与 generation，布局更新重新解析几何；销毁恢复 cell 原 mask 并移除子 view。直接动作与拖出释放按压，菜单关闭使用 generation，工具面隐藏/失焦在原生主线程重查状态后清除。源码和编译/模型测试已完成；当前桌面自动化无法访问 SystemUIServer，实际按压闪亮、菜单 tracking、外观/缩放仍未被验证，不能据此勾选 9.1/9.3。

优先使用既有 objc2/AppKit 与公开扩展点，不引入私有 API 或全局 method swizzling。若公开 API/当前 tracking 无法满足，记录具体阻塞和可审查的依赖适配方案，任务保持未完成；不默默改成多个原生 status items。依赖适配必须仍保留单组合项及已有资源生命周期。Windows 单主图标保持当前系统反馈，无虚构子单元。

**取舍：** 独立 NSStatusItem 天然提供单项高亮，但改变组合宽度、间距、收缩与维护方式；本提案保留组合架构。局部绘制需验证原生 tracking 和系统外观，不能仅凭 API 存在宣称已支持。

### 9. 验证分为规范、自动化与真实桌面交互

- 规划阶段仅生成/校验 artifacts，不勾选实施任务，不运行应用来暗示 UI 已完成。
- 实施时针对导航 overflow/选择回退、偏好迁移、dismiss generation/dialog guard、tooltip 单元名称和布局同步增加有意义的测试，不用断言每个 CSS 像素的测试替代视觉验收。
- 常规 `pnpm test/build`、Rust fmt/check/test、独立 build-graph 快照、严格 OpenSpec 和 diff gate 见 tasks。
- 在 `pnpm tauri dev` 验证四张截图对应流程；使用合成插件/任务样本检查 1/5/20/50 项、中文/英文长名称、窄/短窗口、键盘及 reduced motion，不安装私人插件/暴露文档路径。
- 本轮补充验收：设置同窗口切换/返回、首次由 tray 打开/连续目标交接、有效工具回退/任务保留；工具按压/菜单/面激活局部高亮、Ø 整组反馈、清理与布局刷新。任务仅按本轮独立 evidence 勾选，旧 evidence 不能覆盖此增量。
- macOS 提示、混合 DPI、多显示器、native dialogs 和 Windows fallback 均需要设备证据；不可用的设备门禁保留未完成。

## Risks / Trade-offs

- **[图标导航降低新用户辨认能力]** → 使用不同形状、完整名称提示/无障碍标签，展开主侧栏显示名称，工作区标题持续可见。
- **[blur 与状态栏点击或原生 modal 冲突]** → 延迟焦点复查、展示 generation、原生作用域 guard，实机检查重复点击、切换应用和 picker 取消。
- **[tooltip 与 tray-icon tracking 生命周期不兼容]** → 首先做有边界的原生验证，隔离 adapter、保留 owner，按单元更新测试不过则保持任务未完成。
- **[布局收缩触发重挂载而影响插件任务]** → 保持稳定 plugin id/component key，布局状态仅改变导航宽度；Rust 权威队列与懒加载边界不变。
- **[长队列或插件内容挤出底部动作]** → flex/grid 的 min-height:0 与独立滚动区域，测试短窗口和错误/队列状态。
- **[无意覆盖并行关于/诊断等变更]** → 实施前再次核对工作树，仅修改本提案直接关联的 shell、导航、原生生命周期与 File 展示部分。

- **[设置交接通知先于 main ready]** → 原生保存最新目标并在 ready 后交接，测试首次创建与快速连续请求。
- **[离开工具导致输入丢失或隐藏页面继续轮询]** → 稳定挂载与显式视图活动状态，回归待选文件/查询/滚动、任务与隐藏时刷新。
- **[tray-icon 自动 highlight 覆盖局部背景]** → 原生可行性验证覆盖 mouseDown 与菜单 tracking，检查整组闪亮；方案不满足则保持未完成。

## Migration Plan

1. 从当前源码复核边界，先验证 macOS tooltip 方案，再实现原生 dismissal helper 与 race/guard 测试。
2. 引入 typed icon 展示与导航组件，完成托盘 overflow，再完成侧栏与旧偏好归一化。
3. 移除宿主重复工作区头，调整 File 展示，验证所有插件及扩展 fallback。
4. 增量迁移设置到 main，验证所有入口、controller 复用、工具上下文和旧 label/caller/capability 清理；验证局部高亮原生方案后接入状态与生命周期。
5. 完成自动门禁与可用设备验收，记录每个平台与环境的实测范围；未经请求不提交、推送或归档。
6. 回滚设置承载可恢复独立窗口入口，保留用户偏好数据；高亮 adapter 可独立移除。回滚可独立恢复原导航/宿主头、停止 dismissal handler、移除 tooltip adapter；旧代码忽略新增侧栏偏好，不需要迁移/删除用户数据。
