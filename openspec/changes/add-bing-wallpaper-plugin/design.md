## Context

ZTool 已有截图和咖啡因两个内置工具，并正在通过统一插件注册表、manifest、权限枚举和 Extension API Bridge 承载内置及第三方插件。当前内置插件使用 `ztool.<name>` 作为注册表名称，通过 React 内置渲染器加载；第三方 WebView 被隔离且 `connect-src 'none'`，不能直接使用 Tauri IPC 或自由访问网络。现有权限包含 `network`、`storage.plugin` 和 `ui.message`，但 Bridge 尚未提供二进制文件缓存和设置系统壁纸的完整能力。

Bing 每日壁纸需要同时跨越四个边界：Bing HTTPS API、`~/.ztool/data/wallpaper/` 持久化、React 卡片状态和桌面系统壁纸 API。按项目 Clean Architecture 约束，React 只负责展示和交互，Rust 负责 HTTP、路径安全、文件生命周期和平台调用。Bing 返回的 `title` 与 `copyright` 不保证能拆成独立地点字段，且一次请求可能少于 10 条；实现必须保留原始署名并对缺失字段和部分结果做降级。

本次依赖调研显示，用户建议的 `wallpaper` crate 最新发布版为 `3.2.0`（2021-07-09，Unlicense，约 7.6 万下载），GitHub `reujab/wallpaper.rs` 约 119 stars，最近主分支提交为 2022-11-28。它仍是最成熟的通用 Rust 壁纸库，但不满足“近期活跃维护”的理想条件；`more-wallpapers` 和现有 Tauri wallpaper 项目在采用量或能力范围上也没有形成更稳妥替代。因此系统壁纸实现必须被适配层隔离，并以当前工具链、macOS 和 Windows 实机验证作为最终引入门槛。

2026-07-15 兼容性 spike 记录：`wallpaper = "3.2"`（锁定 3.2.0、关闭默认 `from_url` feature）已通过当前稳定 Rust 的 macOS `cargo check`/`cargo test`，并单独通过 `x86_64-pc-windows-msvc` target 的 `cargo check --no-default-features`。全项目从 macOS 交叉检查 Windows 时会在 `reqwest` 的 `aws-lc-sys` 处因本机没有 Windows SDK headers 停止，因此完整 Windows 项目验证保留在 `windows-latest` CI；该失败发生在 ZTool 和 `wallpaper` 源码编译之前。依赖许可证为 Unlicense，维护时间风险由 `WallpaperSetter` 适配层隔离。

## Goals / Non-Goals

**Goals:**

- 交付第三个内置工具 `ztool.bing-wallpaper`，默认展示最新壁纸并可浏览最近 10 个日期条目。
- 先显示本地缓存，再静默刷新远端；断网、部分下载失败或 Bing 返回少于 10 条时仍保持可用。
- 让 Rust 统一负责 Bing 请求、图片下载、缓存索引、滚动清理、下载目录复制和系统壁纸设置。
- 为 React 定义无 `any` 的显式状态模型、Hook、Service 与 Rust/TypeScript 对称 IPC 契约。
- 扩展宿主权限和 Bridge，使受信插件能通过 `network.fetch`、`storage.writeFile` 与 `system.setWallpaper` 使用受控原生能力，同时默认拒绝越权请求。
- 保持 400×500 托盘窗口中的卡片紧凑、可键盘操作，并让主窗口/窄宽度布局可响应式收缩。

**Non-Goals:**

- 不新增 WASM 插件运行时；清单中的 `plugin.wasm` 由现有内置 `webview` 运行时和 React 渲染器取代。
- 不开放任意绝对路径文件写入、不受限网络访问、任意 Tauri command 或 shell 执行。
- 不实现账号、收藏、自动定时轮换、多显示器分别设置、图片编辑或 Bing 之外的数据源。
- 不保证移动端可以设置系统壁纸；本次平台能力限定为桌面端，移动端只保留未来可扩展的数据和布局边界。
- 不把远端图片 URL 直接交给 WebView 加载，也不为缓存目录开放宽泛的 Tauri asset protocol。

## Decisions

### Decision 1: 作为统一注册表中的内置插件交付，而不是引入单插件 WASM 运行时

新增 manifest 记录遵循现有内置插件约定：

```json
{
  "name": "ztool.bing-wallpaper",
  "id": "bing-wallpaper",
  "displayName": "Bing 壁纸",
  "version": "1.0.0",
  "author": "bells",
  "main": "plugins/bingWallpaper",
  "runtime": "webview",
  "platforms": ["macos", "windows", "linux"],
  "permissions": ["network", "storage.plugin", "system.wallpaper"]
}
```

`BingWallpaperPanel` 加入内置渲染器映射，注册表名称用于宿主唯一性，短 ID 保留用户方案中的 `bing-wallpaper`。这样能复用插件启用/禁用、偏好可见性、健康状态和导航，不需要先设计 WASI、沙箱、组件模型或 WASM 与 WebView 间的新消息协议。

替代方案是构建 `plugin.wasm` 执行器。该方案会把运行时、安全和打包问题扩大成独立项目，且与当前 `webview | script | binary` 契约不兼容，因此不纳入本次范围。

### Decision 2: Rust 服务拥有完整数据流水线，Tauri command 保持薄层

新增模块按职责拆分：

```text
src-tauri/src/
  commands/bing_wallpaper.rs       Tauri 输入输出与 AppHandle/State 注入
  services/bing_wallpaper.rs       Bing 元数据、合并、缓存与下载编排
  services/wallpaper.rs            WallpaperSetter 平台适配与路径校验

src/plugins/bingWallpaper/
  contracts.ts                     Rust 对称类型
  bingWallpaperService.ts          invoke 边界
  bingWallpaperModel.ts            排序、选择和导航纯函数
  useBingWallpaper.ts              异步状态与生命周期
  BingWallpaperPanel.tsx           卡片渲染与可访问交互
```

核心命令形状：

```rust
#[tauri::command]
pub async fn get_bing_wallpaper_snapshot(
    state: tauri::State<'_, BingWallpaperState>,
) -> Result<BingWallpaperSnapshot, BingWallpaperError>;

#[tauri::command]
pub async fn refresh_bing_wallpapers(
    state: tauri::State<'_, BingWallpaperState>,
) -> Result<BingWallpaperSnapshot, BingWallpaperError>;

#[tauri::command]
pub async fn get_bing_wallpaper_preview(
    input: BingWallpaperActionInput,
    state: tauri::State<'_, BingWallpaperState>,
) -> Result<BingWallpaperPreview, BingWallpaperError>;

#[tauri::command]
pub async fn save_bing_wallpaper_to_downloads(
    input: BingWallpaperActionInput,
    app: tauri::AppHandle,
    state: tauri::State<'_, BingWallpaperState>,
) -> Result<BingWallpaperActionResult, BingWallpaperError>;

#[tauri::command]
pub async fn apply_bing_wallpaper(
    input: BingWallpaperActionInput,
    state: tauri::State<'_, BingWallpaperState>,
) -> Result<BingWallpaperActionResult, BingWallpaperError>;
```

对应前端只通过 typed service 调用：

```ts
export interface BingWallpaperActionInput {
  wallpaperId: string;
}

export const bingWallpaperService = {
  snapshot: () => invoke<BingWallpaperSnapshot>("get_bing_wallpaper_snapshot"),
  refresh: () => invoke<BingWallpaperSnapshot>("refresh_bing_wallpapers"),
  preview: (input: BingWallpaperActionInput) =>
    invoke<BingWallpaperPreview>("get_bing_wallpaper_preview", { input }),
  save: (input: BingWallpaperActionInput) =>
    invoke<BingWallpaperActionResult>("save_bing_wallpaper_to_downloads", { input }),
  apply: (input: BingWallpaperActionInput) =>
    invoke<BingWallpaperActionResult>("apply_bing_wallpaper", { input }),
};
```

Rust 结构体使用 `#[serde(rename_all = "camelCase")]`，TS 使用相同字段名；错误返回 `{ code, message, retryable }`，而不是让 UI 解析任意字符串。`BingWallpaperState` 合并并发刷新，防止托盘和主窗口同时激活时重复下载。

替代方案是让 React 直接 `fetch` 并写文件。它会绕过隔离 CSP、复制错误处理并破坏系统能力边界，因此拒绝。

### Decision 3: 缓存索引是源数据，图片采用临时文件加原子替换

缓存固定在用户要求的目录：

```text
~/.ztool/data/wallpaper/
  index.json
  20260714-<bing-hash>.jpg
  .staging/<wallpaper-id>.part
```

`index.json` 包含 `schemaVersion`、`refreshedAt`、`market` 和按日期排序的元数据，图片路径只保存相对文件名。启动时先读取并校验索引和现存图片；损坏记录被跳过而不是使插件整体失败。

刷新使用 `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=10&mkt=zh-CN`，只接受 HTTPS、`www.bing.com` 主机及 Bing 返回的同主机图片路径。远端记录与有效旧缓存按稳定 ID 去重、按 `startDate` 降序合并并截取 10 条，因此 API 返回少于 10 条时可由仍有效的历史缓存补足。下载限制响应大小、超时、重定向和并发数；文件写入 `.part`，校验响应类型和可解码图片后再 rename。清理只删除旧索引明确拥有的缓存文件，不删除目录中的未知用户文件。

默认后台获取可用于壁纸的 1920×1080 图片，当前选中项优先，其余最多两个并发。应用或保存时若文件尚未完成下载，则该操作先按需获取该项并显示独立 busy 状态。

替代方案是只缓存远端 URL或将 10 张图全部 base64 放入 snapshot。前者无法离线使用，后者会扩大 IPC 和 React 内存，因此 snapshot 仅返回元数据与 `cached` 状态；预览命令按选中项返回一个受大小限制的 data URL。

### Decision 4: 原始 Bing 字段原样保留，展示字段采用可预测降级

Rust 解析层保留 `startdate`、`title`、`copyright`、`copyrightlink`、`url`/`urlbase` 和 `hsh`。标准化项至少包含：

```text
id, startDate, title, attribution, copyrightUrl,
remoteUrl, cacheFileName, cached
```

主文本优先使用非空 `title`；为空时使用 `copyright` 中署名括号前的文本；仍为空则显示本地化“Bing 每日壁纸”。辅助文本始终尽量展示 Bing 原始 `copyright`，不通过脆弱正则声称已准确提取地点或摄影师。这样满足标题/地点/版权信息展示，同时不篡改署名。

### Decision 5: 导航选择属于前端，缓存与可用性属于后端

`bingWallpaperModel.ts` 将项目按最新到最早排序，默认选择最新项，并以稳定 ID 在刷新后保持当前选择。左箭头 `<` 表示“查看更早”，右箭头 `>` 表示“查看更新”；到达最老或最新边界时对应按钮禁用。纯函数覆盖空列表、单项、刷新后缺失 ID 和边界导航测试。

`useBingWallpaper` 首次挂载立即读取缓存 snapshot，再在后台 refresh；分别维护 `isLoading`、`isRefreshing`、`isPreviewLoading`、`isSaving`、`isApplying` 和 `error`。卸载时阻止异步结果回写，并释放当前预览引用；Rust 下载不因单个 WebView 卸载而留下半写文件。

### Decision 6: 卡片提供明确下载/应用动作，点击缩略图等价于应用

Header 左侧显示“壁纸”，右侧依次提供下载、应用、较早和较新按钮。Content 使用 16:9 圆角缩略图和右侧两级文本；在窄宽度下改为上下布局。点击缩略图等价于点击“应用”，并使用明确的 `aria-label`/title 提示系统状态变化；下载与应用分别显示进行中状态和成功/失败反馈，不让刷新禁用已经缓存项目的导航。

替代方案是用一个图标在下载和应用之间隐式切换。该行为难以发现且容易误操作，因此拆为两个动作，同时保留用户要求的一键点击缩略图应用。

### Decision 7: Bridge 暴露受限资源 API，而不是任意文件和系统调用

权限枚举新增 `system.wallpaper`，并在 Rust contracts、TS contracts、manifest 校验、市场权限显示和 Bridge 中同步。SDK 外观可提供：

```ts
ztool.network.fetch(request)
ztool.storage.writeFile(relativePath, bytes)
ztool.system.setWallpaper(relativePath)
```

底层消息方法分别是 `network.fetch`、`storage.writeFile`、`system.setWallpaper`：

- `network.fetch` 需要已声明并批准的 `network`，只允许 HTTPS、宿主策略允许的域名、有限方法/响应大小/超时，默认拒绝 loopback、私网地址和跨协议重定向。
- `storage.writeFile` 需要 `storage.plugin`，只接受规范化相对路径并解析到该插件的数据根；拒绝绝对路径、`..`、符号链接逃逸和超限内容。
- `system.setWallpaper` 需要 `system.wallpaper`，只接受该插件数据根中已验证的本地图片；它不能读取或应用任意用户路径。

三个方法返回结构化成功或错误结果。内置 Bing 插件通过 typed Tauri service 复用同一 Rust 服务；隔离 WebView 继续保持 `connect-src 'none'` 并通过 postMessage Bridge 请求能力。

### Decision 8: 系统壁纸后端以适配层隔离成熟但维护较慢的 crate

定义最小接口 `WallpaperSetter::set_from_path(&Path) -> Result<(), WallpaperError>`，业务服务只依赖该接口。首选对 `wallpaper = "3.2"` 做编译/行为 spike，并关闭不需要的远程下载能力；它只接收宿主已验证的绝对缓存文件。若该版本不能通过当前 Rust、macOS 或 Windows 验证，则替换适配器实现而不改 IPC、缓存或 UI。

Linux 只在后端能可靠识别并支持当前桌面环境时调用，缺少命令/桌面环境时返回 `platform_unsupported` 或 `dependency_missing`。任何平台错误都通过 `BingWallpaperError` 返回，不使用 `unwrap`。

选择这个隔离方案，是在“开源复用优先”和依赖维护风险之间保持可替换边界；直接把 crate 调用散落在 command 中会使后续替换和测试困难。

### Decision 9: 保存操作复制到系统下载目录并避免覆盖

保存命令通过 Tauri path resolver 获取 Downloads 目录，生成清理过的 `<date>-bing-wallpaper.jpg` 文件名；同名文件存在时追加序号。复制来源必须是缓存索引中的已验证文件。无法解析下载目录或复制失败时返回可恢复错误，不退化为任意路径写入；后续可另行增加“另存为”对话框。

## Risks / Trade-offs

- [Risk] Bing 非公开 SLA 的接口字段、数量或 URL 规则变化 → 保留原始解析层、允许少于 10 条、使用缓存降级，并为未知字段/空字段写 fixture 测试。
- [Risk] 后台下载 10 张全尺寸图增加流量和磁盘占用 → 限制为 10 条、两个并发、响应大小上限，选中项优先，清理旧索引拥有的文件。
- [Risk] `wallpaper` crate 维护较慢或某平台行为退化 → 通过 `WallpaperSetter` 隔离，实施前做 macOS/Windows spike，锁定版本并保留替换适配器的路径。
- [Risk] 本地路径或重定向绕过插件沙箱 → 所有路径 canonicalize 并校验根目录，拒绝绝对/父路径/符号链接逃逸；网络拒绝私网和不受信主机。
- [Risk] 托盘与主窗口同时激活造成重复刷新/索引竞争 → Rust state 合并并发刷新，索引写入采用 staging + atomic rename。
- [Risk] data URL 预览占用 WebView 内存 → 一次只返回当前项、限制图片大小，切换/卸载时释放前一预览引用。
- [Risk] 点击缩略图会立即改变系统壁纸 → 缩略图提供明确 hover/title/aria 文案，应用状态可见；下载使用独立按钮避免动作混淆。
- [Risk] Linux 桌面环境支持碎片化 → capability snapshot/错误明确报告支持状态，不把失败伪装成成功。

## Migration Plan

1. 先添加纯 Rust/TS 数据契约、Bing fixture 和权限枚举测试，确保 `system.wallpaper` 在两端及 manifest 校验中同步。
2. 完成 `WallpaperSetter` spike；仅在当前 Rust、macOS 和 Windows 验证通过后把选定依赖锁入 `Cargo.lock`。
3. 实现缓存路径、索引、Bing 解析、受限下载和清理服务，再用临时目录及注入 fetcher/setter 的方式测试，不触碰真实用户壁纸。
4. 添加薄 Tauri commands 与 typed TS service，注册 state/commands，并完成 IPC 合约测试。
5. 添加纯导航 model、Hook 和卡片组件，注册 `ztool.bing-wallpaper` manifest、渲染器、偏好和 i18n。
6. 扩展 Extension API Bridge 的受控资源方法、权限拒绝和路径/网络安全测试。
7. 运行前端、Node、Rust 和 OpenSpec 校验；在真实 Tauri 应用中手动验证在线/离线、10 天导航、下载、设置壁纸及重启缓存恢复。

回滚时可从 bundled manifest/renderer 中移除或默认禁用 `ztool.bing-wallpaper`，保留缓存数据不主动破坏用户文件；新增权限和宿主 API 可继续保留但默认拒绝未批准插件。若壁纸后端有平台问题，只替换或禁用 `WallpaperSetter`，不回滚浏览和下载能力。

## Open Questions

- Linux MVP 要承诺哪些桌面环境，还是首版只声明 macOS/Windows 支持并在 Linux 隐藏“应用”动作？
- 是否需要在首版给用户提供“仅缓存当前图”选项，以进一步控制网络和磁盘使用？
- Bing 版权链接是否在卡片中可点击打开，还是首版只展示文本并把链接保留在数据模型中？
