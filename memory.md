# Zero Memory

更新：**2026-10-23**，源码核对基线 `b3e9ebf`。这里保留当前工作地图与稳定决策，不堆叠旧测试数字或提交状态。完整来源、任务数量和历史验收链接见 [项目全景](docs/project-overview.md)；协作要求见 [AGENTS.md](AGENTS.md)。

## 产品方向

- Zero 是跨平台桌面工具箱，从状态栏 / 系统托盘快速使用各个独立可插拔的插件工具。紧凑快捷入口与完整主窗口工作区承担不同任务。
- 桌面当前五工具：Snap、Awake、Paper、Launch、File。**维护者下一阶段会重新体验五个工具，再逐个优化一版**；先复现实际体验问题，再做可验证的小范围改动，不据此扩张为全面重写。
- 官网已是独立 Astro 产品站 + 在线工具箱，不再是未来计划。八工具涵盖开发、图片、文本；桌面与网页独立交付，网页工具不自动等于桌面插件。
- README 保持完整中英文；产品原则在 [PRODUCT.md](PRODUCT.md)。准确区分源码实现、打包内容、设备验收与生产部署。

## 三个工程与组合边界

- 桌面 `src/` + `src-tauri/`：React 19 / TypeScript / Vite，Tauri 2 / Rust 2021。
- 官网 `website/`：Astro，独立 package/lockfile/build，不依赖桌面 IPC 或 File 引擎。
- 可选反馈 `feedback/`：Node/Hono/Waline/PostgreSQL，独立 package/lockfile/build、部署和 GPL-2.0-only 许可；本地 PGlite 只作合成数据验证。
- 五插件目录为 `src/plugins/{screenshot,caffeine,bingWallpaper,quickLauncher,file}`，ID 为 `zero.snap/awake/paper/launch/file`。
- 前端组合：`src/appShell/bundledPluginModules.ts` + 构建选定的 `bundledPluginCatalog.*.ts`；原生状态/lifecycle/诊断：`src-tauri/src/bundled_plugins.rs`；command/protocol 注册：`lib.rs`。
- `src/core/` 不导入具体插件，插件不互相导入。共享窗口、状态栏、快捷键、导航、OCR 由宿主协调；typed IPC 逐项匹配 serde，禁止 TS `any`。
- 内置插件是编译期可信模块。full 五工具，standard 四工具（无 File），core 无工具；当前试用打包为 core/standard。可插拔不意味着动态加载 Rust。
- `.zplugin` 包管理/权限 Bridge 与公开 Web API v1 分开：`PUBLIC_WEB_RUNTIME_ENABLED=false`；macOS debug 可显式 `ZERO_PLUGIN_WEB_DEV=1`，不代表发布。legacy process runtime 也不等同隔离 WebView 或 OS sandbox。

## 窗口、平台与原生流程

- `tray`：隐藏启动的 400×500 快捷面板；`main`：920×660 工具/设置工作区，设置是其中视图；`about`：500×560 独立窗口。
- 专用窗口 `launcher`、`paper`、`capture`、`pin-*`；Snap/Awake 使用原生动作菜单，`snap-menu` WebView 已移除。
- `zero-file-engine` 隐藏引擎单独处理路由和 capability，不加入 default capability。窗口变化同步核对路由、调用者、焦点、活动状态与销毁。
- Snap：macOS 自定义编辑器，属性/对象编辑与撤销重做、复制/保存/钉图、Vision OCR；Windows 仅系统截图启动器；Linux 不支持。默认 `CommandOrControl+Shift+A`。
- 截图 raw IPC + token，导出为 prepare lease → raw PNG upload；旧 Base64 commit 文档无效。新 session/media/lease 多为 camelCase，旧响应可为 snake_case。
- Awake：macOS `caffeinate -d -i`，Windows `SetThreadExecutionState`。Paper：Rust 受控 Bing 网络、最多 10 条缓存，Linux 应用取决于桌面后端。
- Launch：macOS 应用包 / Windows 开始菜单索引；仅宿主 itemId 可启动/聚焦/打开设置，不接收任意路径/命令/URI。默认 Option+Space / Ctrl+Alt+Space。打包 release 为所含工具创建系统搜索转发入口；原始查询不持久化。
- macOS Vision OCR 为宿主共享服务，Snap 限会话选区，File 限引擎 run/page/lease，正文不写诊断。
- 用户正常 `pnpm tauri dev` 的 Snap 体验确认与代理临时 `.app` 权限预检失败是不同证据；不能将后者写成当前产品启动失败。多屏/IME/完整导出、Windows 与安装包专项仍独立保留。

## File 状态与诊断顺序

- 内置 PDF→DOCX 有 macOS/Windows 实现；扫描页 OCR 当前仅 macOS。内置 DOCX→PDF 为 macOS 11+；Windows 无内置 exporter，外部 LibreOffice/Word 是可选兼容 provider。
- `src-tauri/file-engine-policy.json`：候选 **1.2.0**、协议 **2**，approved 包列表为空、候选 false、archive digest 为 null。源码/资源准备不代表签名发布批准。
- `ZERO_FILE_ENGINE_DEV_ASSETS=1 pnpm tauri dev` 只启用 debug 源码回退，release 无效。遇到修复/重装提示先查 provider diagnostic → 已装身份/版本 → policy/签名/资产 → 隐藏 WebView readiness，不放宽 policy 消错。
- 可编辑正文不等于原版式保真。完整语料、取消/冷启动/内存、离线安装、回滚及 Windows runtime 仍有独立门禁，参见[引擎指南](docs/plugins/zero-file-offline-engines.md)。

## 官网工具、隐私与反馈

- 目录 `/tools/` / `/en/tools/`；源注册表 `website/src/content/web-tools.ts`。开发：timestamp/json/base64/diff；图片：image-converter/image-watermark/image-compressor；文本：markdown。
- 五个桌面说明页另计。当前生成规则为 36 个可索引页 + 两个 noindex 错误页；源码目录和实际生产部署分开核实。
- 纯规则/契约 `src/lib/web-tools/`，DOM/Worker/lifecycle `src/scripts/web-tools/`，双语 metadata/guides `src/content/`，页面组件 `src/components/webTools/`（均相对 website）。
- 浏览器本地处理输入，重任务可终止、限时/限量、revision 拒绝旧结果，清空/离页回收 Blob/Worker。初次加载及按需 codec/字体仍需网络，不能宣传完整离线或零请求。
- Markdown 提供源码/预览/分屏与 Markdown/HTML/文字型中文 PDF 下载；默认不持久化，用户可主动保存一篇本机草稿。外部图默认不请求，主动许可后请求来源，无服务器代理。PDF 字体覆盖、页数、内存/输出仍有限制。
- 图片批量转换/水印/压缩共享 pipeline；当前 12,200,000 像素/单图 16 MiB/10 张候选限额，48MP 拒绝。处理结果清理源元数据，“保留原图”保留原字节；不承诺 HDR/Live Photo/原色域保真。
- 2026-10-23 Markdown 记录已有 Chrome 回归及真实桌面 Safari 27.0.1 代表性验收；真实 iPhone 仍未完成。图片的合成 12MP 实验不代替相机原片、生产工作台和真实手机内存/下载矩阵。
- 反馈默认关闭、主动点击才异源加载，仅传稳定 thread/locale，不附工具内容。9 线程（目录 + 八工具），中英共享；访客纯文字先审后公开，仅站长回复。服务不可用不阻断计算。
- 反馈部署、费用/资格、周期清理、日志备份保留、多实例与 Safari iframe 仍有门禁；保留固定 Waline 发布材料的许可判断。维护见[官网指南](docs/website.md)、[服务说明](feedback/README.md)。

## 数据与兼容性

- 保留 bundle ID `com.watson.ztool`，当前数据 `~/.zero` 与 `zero.preferences.v1`。旧 `.ztool` / `ztool.preferences.v1` 迁移不删除，当前值优先；四个旧 ID 映射不含 File。
- Paper：`~/.zero/data/wallpaper/`；Launch：`~/.zero/data/quick-launcher/`；包：`~/.zero/plugins/`；File 暂存：Tauri app cache `file-conversion`。
- 本地诊断先看 `code/phase/outcome` 和权限上下文；不读/打印凭据、正文或用户私有数据。缓存仅清理自身拥有的数据。

## 验证与工作习惯

- 桌面版本 0.1.0，pnpm 10.33.0；统一 Node 24+（website/feedback 必需），桌面亦兼容 Node 22.13+ 的 22.x。版本/候选/任务数量每次发布前再核对。
- 根 `pnpm test` 编译 fixture 后递归运行；准备会替换 `/private/tmp/zero-tests`。不要并发准备根/官网 fixture 或写入共享 File 引擎资产。
- 根、website、feedback 分别验证，命令见 AGENTS；官网 check/test/build/test:seo/test:browser 串行。bundle 检查使用 `--output /tmp/zero-build-graph.json` 避免覆写历史证据。
- CI 桌面 macOS/Windows，完整前端测试仅 macOS；网站 CI 在 Ubuntu 跑 Chromium。`release.yml` 已是 Package Zero/profile 打包，不再沿用旧 ZTool 发布流程描述。
- 2026-10-23：32 个活跃 OpenSpec 变更、158 项未勾选任务，主 specs 仍两项。校验通过不表示任务完成；保持设备门禁，未经请求不同步/归档。
- 本次只核对源码与文档并运行文档/规范检查，未重跑完整功能回归。旧测试数量、包体/RSS 与远程发布状态应查具体 evidence/实时来源，不写成无日期的当前结论。
- 提交、推送、发布、部署、spec 同步和归档按授权分别执行；本轮文档整理不包含这些交付动作。
