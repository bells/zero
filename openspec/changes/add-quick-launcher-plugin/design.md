## Context

Zero 当前通过插件注册表统一管理三个 bundled webview 工具：`zero.snap`、`zero.awake` 和 `zero.paper`。前端由 `bundledPlugins.ts` 提供清单、`App.tsx` 映射 React renderer；Rust 端由 `plugins/registry.rs` 负责 bundled record 的播种与迁移。原生能力通过薄 Tauri command、`services/` 中的业务服务和 Rust/TypeScript 对称契约暴露，第三方 ExtensionSurface 则只能使用经过身份、启用状态和已批准权限检查的消息 Bridge。

Zero Launch 横跨应用目录扫描、系统运行状态、原生聚焦/启动、URI 打开、模糊匹配、拼音转换、持久化缓存、文件系统监听、全局快捷键、独立窗口和 React 列表交互。磁盘与系统 API 必须由 Rust 持有；React 只消费已经归一化的搜索结果并管理输入、选中项和可访问交互。任意路径或 URI 都不能成为 WebView 可控的执行参数。

首版正式支持 macOS 和 Windows。Linux 桌面应用发现、窗口激活和设置 URI 缺少统一契约，因此返回明确的 unsupported capability，不以空结果冒充支持。移动端不注册该插件。

## Goals / Non-Goals

**Goals:**

- 把 Zero Launch 作为第四个 bundled plugin 接入现有注册表、偏好、导航、i18n 和故障隔离模型。
- 提供主插件面板与全局快捷键唤起的浮动 Launcher，两者复用相同的 View、Hook、typed service 和 Rust 索引。
- 在 macOS/Windows 发现应用和常用系统设置，以英文、中文、全拼、拼音首字母、词首缩写及受控 Alias 完成内存模糊匹配。
- 对可可靠识别的运行中应用执行聚焦，否则启动应用；将成功行为记录为本地频率和最近使用权重。
- 通过缓存优先启动、后台刷新和目录 Watcher 避免在每次输入时访问磁盘，目标是在参考数据集上将纯内存匹配 p95 控制在 5ms 内。
- 以宿主签发的稳定条目 ID、最小权限和对称 Rust/TypeScript 类型保护所有扫描、搜索、图标和激活操作。
- 对扫描权限、快捷键冲突、应用消失、焦点限制、设置 URI 失效和缓存损坏提供结构化、可恢复的错误。

**Non-Goals:**

- 不实现 WASM 运行时或用 `plugin.wasm` 替换当前 bundled React renderer。
- 不实现文件、网页、联系人、剪贴板或远程内容搜索，也不实现通用 shell/命令执行器。
- 不承诺激活无稳定进程/窗口身份的所有 Windows 应用；系统限制聚焦时必须报告真实结果并可安全退化为启动入口。
- 不提供用户自定义 Alias、云同步、遥测上传或跨设备使用历史。
- 不在首版支持 Linux、iOS 或 Android 的应用索引和系统设置跳转。
- 不改造整个 Zero 主窗口为全局命令面板；Launcher 是独立插件和独立窗口。

## Decisions

### Decision 1: 复用 bundled webview 插件模型，不引入独立 WASM 插件

清单使用现有字段和命名规范：

```json
{
  "name": "zero.launch",
  "id": "quick-launcher",
  "version": "1.0.0",
  "author": "bells",
  "description": "快速搜索、启动或切换本地应用与系统设置",
  "main": "plugins/quickLauncher",
  "runtime": "webview",
  "platforms": ["macos", "windows"],
  "permissions": [
    "system.apps.read",
    "system.apps.execute",
    "system.window.focus",
    "system.settings.open"
  ]
}
```

前端新增 `quick-launcher` kind 和 `QuickLauncherPanel` renderer；Rust registry 增加同构 manifest、schema migration 和 restore-defaults 记录。插件禁用或隐藏沿用现有动态偏好，禁用时同时注销 Launcher 快捷键并关闭已显示窗口。

用户草案中的 `plugin.wasm` 与当前 `webview | script | binary` runtime 不一致。单独实现 WASI、UI 协议和沙箱会扩大成另一个工程，并不能改善 bundled 插件的应用扫描安全性，因此不采用。

### Decision 2: 一个共享搜索视图服务主面板和独立 Launcher 窗口

前端结构如下：

```text
src/plugins/quickLauncher/
  contracts.ts                 Rust/TS wire contract
  quickLauncherService.ts      typed invoke boundary
  quickLauncherModel.ts        选择、键盘导航、结果分组纯函数
  useQuickLauncher.ts          搜索请求、图标加载、激活与错误状态
  QuickLauncherView.tsx        可复用搜索输入和结果列表
  QuickLauncherPanel.tsx       bundled plugin panel shell
  QuickLauncherApp.tsx         独立 launcher window shell
```

`src/appShell/appSurface.ts` 新增 `launcher` surface，`src/main.tsx` 将窗口 label `launcher` 路由到 `QuickLauncherApp`。Rust 只创建一个 label 固定的窗口，建议初始尺寸约 680×420、无装饰、居中、always-on-top、skip-taskbar，并在重复唤起时复用、清空查询、聚焦输入，而不是重复创建 WebView。

首版默认快捷键为 `CommandOrControl+Shift+Space`，避开 macOS Spotlight 与常见 `Alt+Space` 冲突。快捷键协调器与现有截图快捷键共享注册/错误处理；注册失败时主插件面板仍可使用，并显示可诊断的冲突错误。`Esc` 隐藏窗口，失焦后隐藏；`↑`/`↓` 循环移动可见结果，`Enter` 激活当前项。快捷键设置 UI 留待后续变更。

替代方案是只把搜索框嵌入 400×500 托盘面板。该方案复用成本较低，但无法达到 Alfred/Raycast 式从任意应用唤起的核心目标。

### Decision 3: Rust 持有统一索引、搜索和激活状态

新增 `commands/quick_launcher.rs`、`services/quick_launcher/` 与托管的 `QuickLauncherState`：

```text
src-tauri/src/services/quick_launcher/
  mod.rs                       状态、刷新编排与错误映射
  contracts.rs                 内部索引实体
  catalog.rs                   系统设置白名单
  search.rs                    归一化、拼音、模糊评分与频率权重
  cache.rs                     版本化原子缓存与使用历史
  watcher.rs                   目录监听与去抖刷新
  platform/
    macos.rs                   .app、Info.plist、NSWorkspace/NSRunningApplication
    windows.rs                 .lnk/.exe、ShellExecuteW、窗口/进程状态
    unsupported.rs             明确 unsupported 结果
```

React 不下载全量索引后自行搜索。每次查询调用 Rust 内存索引，避免公开可执行路径、重复实现拼音逻辑和在 WebView 中持有过多系统元数据。`QuickLauncherState` 用读多写少的锁保存不可变 revision snapshot，用单飞刷新门防止启动刷新与 Watcher 刷新重叠；耗时扫描在异步阻塞线程中执行，不能阻塞 Tauri 主线程或输入渲染。

### Decision 4: 对称 IPC 以稳定 item ID 为执行边界

公开的 wire types 使用 `#[serde(rename_all = "camelCase")]` 与匹配的 TypeScript interface，包括：

- `QuickLauncherItemKind = application | systemSetting`
- `QuickLauncherIndexSnapshot { revision, source, refreshing, itemCount, lastUpdatedAt, platformSupport, diagnostics }`
- `QuickLauncherSearchInput { query, limit }`
- `QuickLauncherSearchResult { revision, query, elapsedMicros, items }`
- `QuickLauncherResultItem { id, kind, title, subtitle, running, iconKey, matchedField }`
- `QuickLauncherActivateInput { itemId, revision }`
- `QuickLauncherActivationResult { itemId, action, usageCount, activatedAt }`
- `QuickLauncherIconInput/Result`
- `QuickLauncherError { operation, code, message, retryable }`

薄 commands 为：

- `get_quick_launcher_snapshot()`：立即返回缓存/当前索引状态。
- `refresh_quick_launcher_index()`：触发受合并保护的后台刷新并返回新 snapshot。
- `search_quick_launcher(input)`：只查询内存，限制 query 长度与 result limit。
- `get_quick_launcher_icon(input)`：按有效 icon key 懒加载有大小上限的 PNG data URL。
- `activate_quick_launcher_item(input)`：重新解析当前 revision 中的 item ID 后聚焦、启动或打开设置。
- `show_quick_launcher_window()` / `hide_quick_launcher_window()`：控制唯一 Launcher 窗口。

item ID 由条目种类与平台稳定身份生成，例如 bundle ID、规范化启动目标或设置 catalog ID 的哈希；公开结果不携带可执行 URI。激活请求带 revision，过期且 ID 已不存在时返回 `item_stale` 并要求重新搜索。路径、Bundle ID 或 URI 永远不从 React 回传。

替代方案是直接实现 `launchOrFocus(path_or_bundle_id)` 和 `openSystemSetting(uri)`。这会把 WebView 输入提升为系统执行参数，扩大任意程序启动和 URI 注入边界，因此拒绝。

### Decision 5: 平台扫描器以稳定身份去重，并把运行状态视为易失数据

macOS 递归或定向扫描 `/Applications`、`~/Applications`、`/System/Applications` 和 `/System/Applications/Utilities` 中的 `.app`，读取 `Info.plist` 的 `CFBundleDisplayName`、`CFBundleName`、`CFBundleIdentifier`、`CFBundleExecutable` 和图标键。优先以 Bundle ID 去重；缺失时使用 canonical bundle path。系统目录重叠产生的同一 bundle 必须只保留一次。

Windows 递归扫描 `C:\ProgramData\Microsoft\Windows\Start Menu\Programs` 与 `%APPDATA%\Microsoft\Windows\Start Menu\Programs` 下的 `.lnk` 和 `.exe`，解析快捷方式目标、工作目录、参数和 AppUserModel/可执行身份，并按规范化启动身份去重。无法安全解析的快捷方式进入 diagnostics，不进入可执行索引。

缓存只保存可重建的静态元数据、源文件 mtime 和图标 key，不保存 `running`。运行状态在搜索返回前按当前进程/窗口状态批量刷新，并设置短 TTL，避免缓存把已退出应用标记为运行中。

macOS 使用 `NSWorkspace`/`NSRunningApplication` 的 Bundle ID 激活已运行实例并启动未运行 bundle。Windows 优先枚举与目标身份匹配的顶层窗口并调用 `SetForegroundWindow`；未找到可靠窗口时通过 `ShellExecuteW` 启动 `.lnk`/`.exe`。Windows 前台切换受系统限制时返回 `focus_denied` 或 `launched_fallback`，不得伪造 `focused`。

平台调用封装为 `ApplicationScanner`、`RunningApplicationProbe`、`ApplicationActivator` 和 `IconProvider` traits，测试使用 fake adapter。实施时优先复用现有 `windows` crate；为 `plist`、AppKit 绑定和 `.lnk` 解析选择依赖前必须完成当前 Rust 工具链、许可证、维护活跃度和目标平台编译 spike。

### Decision 6: 系统设置使用宿主白名单 catalog，而不是扫描或接受 URI

`catalog.rs` 维护稳定设置 ID、zh-CN/en-US 标题、搜索 alias、支持平台和平台 URI。首版至少包含通用、显示器、网络、蓝牙、声音、键盘、鼠标/触控板、通知与隐私安全；平台不存在的条目不进入索引。

macOS 映射到经过真实系统版本验证的 `x-apple.systempreferences:` URI，Windows 映射到 Microsoft 文档化的 `ms-settings:` URI。搜索结果只返回设置 ID；激活时重新从 catalog 取 URI并通过平台 shell API 打开。未知 ID、平台不匹配和失效 URI 返回结构化错误。

硬编码 catalog 会随系统版本漂移，但比让前端传任意 URI 更安全、可测且易于按版本维护。设置 URI 变更通过 catalog fixture 与真实平台 smoke test 更新。

### Decision 7: 使用 Nucleo 风格匹配、拼音索引和有上限的使用权重

索引构建时为每个条目预计算：原始标题、Unicode 归一化标题、小写英文、token 首字母缩写、拼音全拼、拼音首字母和受控 alias。中文例如“微信”生成 `weixin` 与 `wx`；Photoshop 的 `ps` 由 bundled alias catalog 提供。查询也进行相同归一化，但不在输入过程中触发磁盘或拼音字典加载。

实施前对 `nucleo-matcher` 与 `fuzzy-matcher` 做 release benchmark 和维护性 spike，默认选择匹配质量、Unicode 支持和维护状态更好的 `nucleo-matcher`；拼音优先评估活跃维护的 `pinyin` crate。两者封装在 `SearchMatcher`/`Romanizer` traits 后，避免库 API 渗透到业务模型。

排序采用确定性分层：精确/前缀匹配和基础 fuzzy score 为主，alias/拼音命中次之，再叠加有上限的 `log2(usageCount + 1)`、时间衰减和小幅 running bonus。频率权重不能使弱匹配越过明显的精确匹配；同分以最近使用、标题和稳定 ID 排序。空查询显示最近/高频条目，并混入有限的常用系统设置。

release-mode 基准使用至少 10,000 个含中英文和 alias 的固定条目，在文档化参考硬件上记录纯内存匹配 p50/p95，p95 目标 `< 5ms`。IPC、运行状态探测和图标解码不计入纯匹配指标，但 UI 需要独立记录端到端耗时以发现回归。

### Decision 8: 缓存优先、原子持久化与去抖 Watcher

数据位于 `~/.zero/data/quick-launcher/`：

```text
apps_cache.json       schemaVersion、platform、entries、source mtimes、updatedAt
usage.json            schemaVersion、itemId -> count/lastUsedAt
icons/                可重建的尺寸受限 PNG 缓存
```

启动时先验证并加载缓存到内存，使 Launcher 可立即查询；随后后台扫描并以新 revision 原子替换。缓存损坏、版本不兼容或平台不匹配时隔离/忽略并重建，不阻止窗口打开。写入采用同目录 `.part`、flush 和 atomic rename；usage 只在激活成功后递增，限制记录数量，已消失条目按保留期清理。

`notify` watcher 只监听已知应用根目录。事件在约 500ms 窗口内合并，然后执行一次后台重扫、diff 和缓存替换；Watcher 不支持、目录缺失或权限拒绝时保留手动/启动刷新，并把降级原因放入 diagnostics。首版允许事件后全量重扫再做集合 diff，因为应用目录规模有限且实现更可靠；不在文件事件回调中逐个解析 bundle。

图标按可见结果懒加载。macOS 通过原生 workspace icon 转换为小尺寸 PNG，Windows 通过 Shell 图标 API 获取；图标 key 包含条目身份与源 mtime，失败时 UI 使用类型 fallback glyph。结果 payload 不嵌入整批 base64 图标。

### Decision 9: 扩展权限 vocabulary 和 Bridge 的多权限授权

Rust/TypeScript 同时新增：

- `system.apps.read`：扫描、搜索和读取应用图标。
- `system.apps.execute`：启动索引内应用。
- `system.window.focus`：聚焦已运行应用。
- `system.settings.open`：打开 catalog 内系统设置。

Extension Bridge 暴露 `launcher.scanApps`、`launcher.search`、`launcher.launchOrFocus` 和 `launcher.openSystemSetting`。`launchOrFocus` 同时要求 `system.apps.execute` 与 `system.window.focus`，因此现有 method-to-single-permission 映射改为 method-to-required-permissions 集合，并继续验证 caller identity、enabled state、declared permissions 和 approved permissions。Bridge 调用与 bundled typed invoke 最终委托同一个 Rust service，不复制平台逻辑。

安装/更新权限审查 UI显示新权限及含义。隔离插件只能拿到安全结果和 item ID，不能直接 invoke 内部 launcher command、读取缓存文件或访问任意系统 URI。

### Decision 10: 激活成功后再计频，并保持错误可恢复

应用激活结果区分 `focused`、`launched`、`launchedFallback`，设置结果为 `openedSetting`。只有平台 adapter 返回成功后才更新 usage，更新失败不会反向宣称应用激活失败，但会在 diagnostics 中报告统计持久化问题。不存在/过期条目、权限拒绝、平台不支持、启动失败、焦点被系统拒绝和 URI 打开失败使用稳定 code 与 retryable 标记。

React Hook 保留查询 generation 和 activation in-flight guard：旧查询完成不能覆盖新查询；激活中忽略重复 Enter；成功后隐藏独立窗口，主插件面板则保留并刷新 running/usage 排序。所有错误在结果区域内可访问地呈现，不抛穿 React 树。

## Risks / Trade-offs

- [Risk] macOS/Windows 私有差异导致应用身份或运行状态不准确 → 用平台 traits 隔离，优先 Bundle ID/解析后 executable identity，无法可靠识别时明确降级，不伪造运行状态。
- [Risk] Windows `SetForegroundWindow` 受前台锁定规则限制 → 返回 `focus_denied`/`launchedFallback`，记录真实 action，并在真实 Windows CI/手测覆盖常规、管理员和商店应用。
- [Risk] 系统设置 URI 随 OS 版本变化 → 维护版本化白名单与平台 smoke test，未知版本失败时保持 Launcher 可用并提示该设置不可打开。
- [Risk] 扫描大量 bundle、解析快捷方式或生成拼音拖慢启动 → 缓存优先、后台 blocking task、预计算 search fields、图标懒加载和去抖 refresh；不在键入路径访问磁盘。
- [Risk] Watcher 产生事件风暴或目录不可监听 → 事件合并、single-flight refresh、重扫冷却时间和手动刷新 fallback。
- [Risk] 使用频率永久压制新应用 → 对 count 使用对数上限和时间衰减，让精确/前缀匹配始终主导。
- [Risk] 使用历史泄露隐私 → 数据只保存在本地插件目录，不上传、不写查询字符串，并提供随缓存重建/清理的明确路径。
- [Risk] 快捷键被其他应用占用 → 注册失败不 panic，面板仍可用并显示诊断；后续再增加可配置快捷键。
- [Risk] 新增四个高权限扩大第三方插件能力 → 每个 Bridge method 使用最小权限集合、批准审查、稳定 item ID 和宿主白名单，不暴露 path/URI。
- [Risk] bundled registry migration 覆盖用户禁用/可见性 → schema migration 只补缺失 record，不改已有记录；偏好 normalization 对新插件使用默认可见而保留旧键。

## Migration Plan

1. 先完成依赖 spike 与纯 Rust fixtures：macOS plist/AppKit、Windows `.lnk`/Shell API、Nucleo/拼音、`notify`，记录许可证、维护状态、二进制影响和两平台编译结果。
2. 新增对称 contracts、四项权限、manifest validator/permission-review/Bridge 多权限测试；此阶段不开放真实激活。
3. 实现平台无关 catalog、search fields、排序、usage 和 versioned cache，以 fixture/临时目录验证拼音、alias、频率上限、损坏恢复与原子写入。
4. 实现 macOS/Windows scanner、running probe、activator 和 icon provider；先用 fake adapter 通过服务测试，再分别做真实平台 smoke test。
5. 添加 `QuickLauncherState`、single-flight refresh、Watcher 和薄 Tauri commands，注册后台缓存加载/刷新并确保主线程不被扫描阻塞。
6. 注册 `zero.launch` bundled record、renderer、偏好/i18n 和 registry migration；验证已有三个插件状态不变。
7. 实现共享 React View/Hook、主插件面板和 `launcher` window 路由，接入全局快捷键、Esc/失焦隐藏、键盘导航和 stale request guard。
8. 完成自动化 gate、release benchmark 和真实 macOS/Windows 手测，包括冷启动、缓存损坏、安装/卸载应用、快捷键冲突、运行中切换和系统设置跳转。

回滚时注销 Launcher 快捷键、从 bundled renderer/manifest seeding 中移除或禁用 `zero.launch`，并保留其他插件 registry 记录。新增权限枚举和 Bridge 方法可以继续保留但默认拒绝未批准插件；`~/.zero/data/quick-launcher/` 是可重建缓存，可由用户安全删除，不影响应用或系统设置。

## Open Questions

- 无阻塞问题。首版使用 `CommandOrControl+Shift+Space` 固定快捷键、macOS/Windows 支持范围和宿主内置 Alias；可配置快捷键、用户 Alias 与 Linux 支持分别作为后续 change。
