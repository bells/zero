# Zero

[中文](#中文) · [English](#english) · [官网 / Website](https://www.usezero.cn/) · [在线工具箱 / Web tools](https://www.usezero.cn/tools/)

## 中文

Zero 是一个跨平台桌面工具箱，从状态栏 / 系统托盘快速使用各个插件工具。每个工具按独立、可插拔的模块组织：快捷入口处理高频操作，主窗口承载完整工具与设置。

官网同时提供无需安装的在线工具箱，在浏览器本地处理文本、图片和文档。桌面工具与在线工具独立开发、构建和交付，共用 Zero 的产品定位。

### 桌面工具箱

| 插件 | 用途 | 当前平台边界 |
| --- | --- | --- |
| **Zero Snap** | 截图、窗口选区、标注与对象编辑、复制/保存/钉图、离线 OCR | macOS 自定义编辑器与 Vision OCR；Windows 普通截图调用系统工具，新增随包离线 OCR 选区流程（真机验收待完成） |
| **Zero Awake** | 按时长保持屏幕与系统唤醒 | macOS、Windows 原生实现 |
| **Zero Paper** | 浏览 Bing 每日壁纸、历史缓存、下载和设为桌面 | macOS、Windows 适配；Linux 应用壁纸取决于桌面后端 |
| **Zero Launch** | 中英文/拼音应用与系统设置搜索、启动和聚焦 | macOS 应用包、Windows 开始菜单索引 |
| **Zero File** | 本地 PDF → DOCX、DOCX → PDF | PDF → DOCX 有 macOS/Windows 实现；内置 DOCX → PDF 仅 macOS 11+，签名引擎尚未批准发布 |

桌面主要面向 macOS 与 Windows，各插件能力并不完全相同；Linux 尚无完整支持与设备验收，移动端未交付。macOS 原生 OCR 为 Snap 与 File 共用服务；File 扫描页 OCR 当前仅在 macOS 提供。转换以可编辑正文为目标，不承诺原版式还原。

- 状态栏 / 托盘提供紧凑快捷入口，主窗口提供完整工具工作区和设置视图，关于窗口独立。
- 支持工具可见性、中文/英文/跟随系统、登录自启和可配置全局快捷键。
- 默认截图快捷键：macOS `Option+A`、Windows `Alt+A`；截图 OCR 默认未分配。在“偏好设置 → 键盘快捷键”或 Zero Snap 设置中可录制、清除、恢复默认，冲突或保存失败保留原设置。Launch 仍为 macOS `Option+Space`、Windows `Ctrl+Alt+Space`，本轮保持只读。
- Windows x64 OCR 随构建打包 CPU 引擎与中英文模型，不依赖 Python、额外 OCR 程序或系统语言包；普通截图保持系统工具。框选后点击识别或按 Enter，Esc 取消，结果可编辑并手动复制。实现与资源校验不等于已完成 Windows 安装包离线验收；开发/打包说明见 [Snap 维护指南](docs/snap.md)。
- 打包 release 启动后会为所包含的工具创建系统应用搜索入口；入口转发到同一个 Zero 实例，不是五个独立应用安装包。详见[打包说明](docs/packaging.md)。

**可插拔的实现边界：**五个内置插件各自拥有描述、界面、翻译与服务契约，由宿主统一注册和管理生命周期，并支持构建裁剪。它们的 Rust 能力随宿主编译；第三方不能动态加载 Rust。`.zplugin` 包管理与权限桥接已存在，但公开 Web Plugin API v1 runtime 仍关闭，不能把开发预览当作正式插件生态。参见[协议现状](docs/plugins/protocol-v1.md)。

当前源码版本为 `0.1.0`。试用打包提供 **core**（无内置工具）和 **standard**（Snap、Awake、Paper、Launch），两者均不包含 File；源码默认 full 配置包含五工具。下载入口见[官网](https://www.usezero.cn/download/)，产物与限制见[打包指南](docs/packaging.md)，不要将源码功能清单等同于每个安装包的内容。

### 官网在线工具箱

入口：[中文工具箱](https://www.usezero.cn/tools/) · [English tools](https://www.usezero.cn/en/tools/)。源码当前提供八项工具：

| 分类 | 工具 | 用途 |
| --- | --- | --- |
| 开发 | 时间戳转换 | 单条/批量 Unix 时间戳、北京时间与 UTC 转换 |
| 开发 | JSON 格式化 | 校验、格式化、压缩、错误定位，保留大整数原文 |
| 开发 | Base64 与 URL 编解码 | Unicode 文本、URL 组件和本地图片编码 |
| 开发 | 文本 / 文件对比 | UTF-8 文本的行级/行内差异、并排/统一视图 |
| 图片 | 图片格式转换 | HEIC/HEIF 主静态图、JPEG、PNG、静态 WebP 转 JPEG/PNG/WebP |
| 图片 | 图片文字水印 | 批量单处九宫格或平铺文字水印 |
| 图片 | 图片压缩 | JPEG/WebP 质量压缩、PNG 无损优化、真实体积对照 |
| 文本 | Markdown 编辑器 | 源码/预览/分屏，下载 Markdown、独立 HTML、文字型中文 PDF |

工具输入在浏览器本地计算，不上传到计算服务。首次加载和按需下载算法、编解码器、字体仍需要网络；这不等于完整离线应用。Markdown 草稿默认关闭，开启后仅在当前浏览器保存一篇；外部图片须主动授权才请求来源。图片、文档和导出都有资源限额，详见各工具说明。

可选反馈是独立服务，默认关闭，主动点击后才加载异源页面；提交的反馈文字会发送到该服务，工具输入与结果不会自动附送。反馈先审后公开，服务故障不影响本地工具计算。更多边界见[官网维护指南](docs/website.md)和[反馈服务说明](feedback/README.md)。

### 本地开发

推荐统一使用 **Node.js 24+、pnpm 10.33.0**。桌面还需要 Rust stable 与平台构建工具：macOS 的 Xcode Command Line Tools，或 Windows 的 Visual Studio Build Tools / WebView2。完整平台依赖见 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)。官网与反馈服务要求 Node 24+；桌面依赖也允许 Node 22.13+ 的 22.x 版本。

在仓库根目录执行：

```bash
# 桌面
pnpm install --frozen-lockfile
pnpm tauri dev

# 官网（独立依赖与锁文件）
pnpm --dir website install --frozen-lockfile
pnpm --dir website dev
```

`pnpm dev` 仅启动桌面前端，系统能力需通过 Tauri 运行。官网开发地址为 `http://127.0.0.1:4321/`。

需要调试 File 源码引擎时：

```bash
ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev
```

该开关仅启用 debug 源码回退，不安装或批准签名包，release 构建不生效。File 候选为 `1.2.0`，发布门禁见[离线引擎指南](docs/plugins/zero-file-offline-engines.md)。

### 项目结构与验证

```text
src/                  React 桌面宿主、五个独立插件、typed service 与 SDK
src-tauri/            Rust 原生服务、IPC、包管理、权限和生命周期
website/              独立 Astro 双语官网与浏览器在线工具
feedback/             独立 Node 服务、审核与存储（GPL-2.0-only）
tests/                桌面单元、集成及源码边界测试
docs/                 架构、协议、打包、官网与诊断指南
openspec/             规范、活跃变更、任务和历史验收证据
```

`src/core/` 不导入具体插件，插件之间不互相导入。桌面前端组合入口是 `src/appShell/bundledPluginModules.ts` 与按构建配置选择的 `bundledPluginCatalog.*.ts`；Rust 组合入口是 `src-tauri/src/bundled_plugins.rs`。官网纯逻辑位于 `website/src/lib/web-tools/`，不依赖桌面 IPC。

按改动范围验证；以下命令分别在仓库根目录执行，准备测试 fixture 的任务不可并发：

```bash
# 桌面
pnpm test
pnpm build
node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked

# 官网（按顺序）
pnpm --dir website check
pnpm --dir website test
pnpm --dir website build
pnpm --dir website test:seo
pnpm --dir website exec playwright install chromium
pnpm --dir website test:browser

# 文档与规范
openspec validate --all --strict
git diff --check
```

原生交互、Windows 设备、真实 iPhone、签名安装包和线上部署需各自验证；构建通过不能替代它们。兼容升级继续保留 `com.watson.ztool`，数据使用 `~/.zero` / `zero.preferences.v1`，旧 `.ztool` 数据只迁移、不删除。

### 当前重点与维护入口

下一阶段由维护者再完整体验并优化五个桌面工具，优先处理真实操作中的入口、交互、反馈和稳定性问题。逐插件形成可验证改动，同时维护官网八工具与平台边界。

[产品定位](PRODUCT.md) · [项目全景](docs/project-overview.md) · [协作规则](AGENTS.md) · [项目记忆](memory.md) · [OpenSpec 上下文](openspec/project.md) · [插件开发](docs/plugins/developer-guide.md) · [插件发布](docs/plugins/publishing-github-releases.md) · [诊断](docs/diagnostics.md)

## English

Zero is a cross-platform desktop toolbox with quick access to plugin tools from the menu bar / system tray. Each tool is organized as an independent, pluggable module: compact entry points handle quick actions, while the main window provides a full workspace and preferences.

The website also offers browser tools that process text, images and documents locally without installing the desktop app. Desktop and web tools are developed, built and delivered independently under the Zero product.

### Desktop toolbox

| Plugin | Purpose | Current platform boundary |
| --- | --- | --- |
| **Zero Snap** | Capture, window selection, annotations and object editing, copy/save/pin, offline OCR | Custom editor and Vision OCR on macOS; system capture plus a bundled offline OCR selection flow on Windows (device acceptance pending) |
| **Zero Awake** | Keep the display and system awake for a chosen duration | Native macOS and Windows implementations |
| **Zero Paper** | Bing daily wallpapers, cached history, download and desktop apply | macOS/Windows adapters; Linux apply depends on the desktop backend |
| **Zero Launch** | English/Chinese/pinyin app and settings search, launch and focus | macOS application bundles and Windows Start Menu index |
| **Zero File** | Local PDF → DOCX and DOCX → PDF | PDF → DOCX implemented for macOS/Windows; built-in DOCX → PDF requires macOS 11+; signed engine release remains unapproved |

The desktop app primarily targets macOS and Windows, with different capabilities per plugin. Linux has no complete support or device acceptance; mobile is not delivered. Snap and File share native macOS OCR; File scanned-page OCR is currently macOS-only. Conversion targets editable text rather than original-layout fidelity.

- Compact menu bar / tray actions, a full main-window workspace with preferences, and a separate About window.
- Tool visibility, English/Chinese/system language selection, login autostart and configurable global shortcuts.
- Default capture shortcut: `Option+A` on macOS and `Alt+A` on Windows; capture OCR is unassigned. Record, clear or reset either Snap binding in Preferences → Keyboard Shortcuts or Zero Snap settings. Registration/save failures preserve the previous setting. Launch remains read-only at `Option+Space` on macOS and `Ctrl+Alt+Space` on Windows.
- Windows x64 builds bundle the CPU OCR engine and Chinese/English models without Python, external OCR software or system language packs; ordinary capture retains the system tool. Confirm a selection with Recognize or Enter, cancel with Esc, and edit the result before explicitly copying. Source/resource checks do not establish installed offline Windows acceptance; see the [Snap maintenance guide](docs/snap.md).
- Packaged release builds create system application-search entries for included tools on startup. These forward to the same Zero instance; they are not five standalone application packages. See [packaging](docs/packaging.md).

**What pluggable means today:** each bundled plugin owns its descriptor, UI, translations and service contracts. The host registers plugins, manages their lifecycle and supports build-time exclusion. Native Rust capabilities are compiled with the host; third parties cannot dynamically load Rust. `.zplugin` package management and permission bridges exist, but the public Web Plugin API v1 runtime remains disabled. Developer previews do not establish a released plugin ecosystem. See [protocol status](docs/plugins/protocol-v1.md).

The source version is `0.1.0`. Trial packages offer **core** (no bundled tools) and **standard** (Snap, Awake, Paper, Launch); both exclude File. The default full source configuration includes all five tools. Check the [download page](https://www.usezero.cn/en/download/) and [packaging guide](docs/packaging.md) for actual artifacts and limitations; the source feature list does not describe every installer.

### Browser toolbox

Open [English tools](https://www.usezero.cn/en/tools/) or [中文工具箱](https://www.usezero.cn/tools/). The current source contains eight tools:

| Category | Tool | Purpose |
| --- | --- | --- |
| Development | Timestamp converter | Single/batch Unix timestamp, Beijing time and UTC conversion |
| Development | JSON formatter | Validation, formatting, compaction and error locations, preserving large integers |
| Development | Base64 & URL codec | Unicode text, URL components and local image encoding |
| Development | Text / file comparison | Line and inline differences for UTF-8 text, split/unified views |
| Image | Image converter | HEIC/HEIF primary stills, JPEG, PNG and static WebP to JPEG/PNG/WebP |
| Image | Text watermark | Batch single-position or tiled text watermarks |
| Image | Image compressor | JPEG/WebP quality compression, lossless PNG optimization and actual size comparison |
| Text | Markdown editor | Source/preview/split views; Markdown, standalone HTML and searchable Chinese-text PDF downloads |

Tool inputs are processed in the browser without uploading them to a computation service. Initial loads and on-demand algorithms, codecs and fonts still need a network connection; this is not a fully offline app. Markdown draft saving is off by default and stores one document in the current browser when enabled. External images require explicit permission before contacting their origin. Images, documents and exports have resource limits described on each tool page.

Optional feedback is a separate service, disabled by default and loaded in a cross-origin frame only after a click. Submitted feedback is sent to that service; tool inputs and results are not attached automatically. Feedback is moderated before publication, and service failures do not block local computation. See [website maintenance](docs/website.md) and [feedback service](feedback/README.md).

### Local development

Use **Node.js 24+ and pnpm 10.33.0** across the repository. Desktop development also requires Rust stable and platform build tools: Xcode Command Line Tools on macOS, or Visual Studio Build Tools / WebView2 on Windows. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). The website and feedback service require Node 24+; desktop dependencies also allow Node 22.13+ on the 22.x line.

Run from the repository root:

```bash
# Desktop
pnpm install --frozen-lockfile
pnpm tauri dev

# Website: separate dependencies and lockfile
pnpm --dir website install --frozen-lockfile
pnpm --dir website dev
```

`pnpm dev` starts only the desktop frontend; native features require Tauri. The website runs at `http://127.0.0.1:4321/`.

To debug the File source engine:

```bash
ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev
```

This flag enables a debug-only source fallback. It neither installs nor approves a signed package and has no effect in release builds. The File candidate is `1.2.0`; see the [offline engine guide](docs/plugins/zero-file-offline-engines.md) for release gates.

### Structure and verification

```text
src/                  React desktop host, five plugins, typed services and SDK
src-tauri/            Rust native services, IPC, packages, permissions and lifecycle
website/              Independent Astro bilingual site and browser tools
feedback/             Independent Node service, moderation and storage (GPL-2.0-only)
tests/                Desktop unit, integration and source-boundary tests
docs/                 Architecture, protocol, packaging, website and diagnostics
openspec/             Specifications, active changes, tasks and dated evidence
```

`src/core/` must not import concrete plugins, and plugins must not import peers. Frontend composition uses `src/appShell/bundledPluginModules.ts` and the selected `bundledPluginCatalog.*.ts`; Rust composition uses `src-tauri/src/bundled_plugins.rs`. Browser domain logic lives in `website/src/lib/web-tools/` without desktop IPC dependencies.

Validate the affected area from the repository root. Do not run fixture-preparation tasks concurrently:

```bash
# Desktop
pnpm test
pnpm build
node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked

# Website, in order
pnpm --dir website check
pnpm --dir website test
pnpm --dir website build
pnpm --dir website test:seo
pnpm --dir website exec playwright install chromium
pnpm --dir website test:browser

# Documentation and specifications
openspec validate --all --strict
git diff --check
```

Native interactions, Windows hardware, real iPhones, signed installers and hosted deployments need separate verification. Successful builds do not replace those checks. Upgrade compatibility retains `com.watson.ztool`; canonical data uses `~/.zero` / `zero.preferences.v1`, with legacy `.ztool` data copied forward without deletion.

### Current focus and documentation

The maintainer will run another hands-on review and refinement pass across the five desktop tools, prioritizing real entry-point, interaction, feedback and stability issues. Improvements should remain scoped and verifiable per plugin, alongside maintenance of the eight browser tools and their platform boundaries.

[Product](PRODUCT.md) · [Project overview](docs/project-overview.md) · [Contributor instructions](AGENTS.md) · [Project memory](memory.md) · [OpenSpec context](openspec/project.md) · [Plugin development](docs/plugins/developer-guide.md) · [Plugin publishing](docs/plugins/publishing-github-releases.md) · [Diagnostics](docs/diagnostics.md)
