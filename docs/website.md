# Zero 官网维护

官网在 `website/`，使用 Astro 静态输出。它有独立依赖、锁文件和构建，不使用桌面 React/Tauri、IPC、File 引擎或根项目的 prebuild。中文为 `/`、`/download/`，英文为 `/en/`、`/en/download/`。

2026-10-12 搜索/AI 增量：增加 `/tools/{snap,launch,awake,paper,file}/`、`/guide/install/` 和 `/faq/`，以及对应 `/en/` 页面，共 18 个可索引 HTML 页面。它们使用现有视觉，静态提供操作步骤、平台/发行边界、内容核对日期与来源。`llms.txt` 提供事实摘要和文档索引，`llms-full.txt` 提供文档全文；均从同一份内容和发行清单生成。它们是补充入口，不保证搜索收录、排名或 AI 引用。

## 开发与检查

需要 Node 24+ 和 pnpm 10.33.0。在仓库根目录执行：

```bash
pnpm --dir website install --frozen-lockfile
pnpm --dir website dev
```

本地地址为 `http://127.0.0.1:4321/`。`--ignore-lock` 保持 Astro 开发/预览在当前进程运行，避免 agent 环境自动后台运行。

```bash
pnpm --dir website check
pnpm --dir website test
pnpm --dir website build
pnpm --dir website test:seo
pnpm --dir website exec playwright install chromium
pnpm --dir website test:browser
```

本机已安装 Chrome 时可用 `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website test:browser`。浏览器检查会先在隔离副本中构建虚构安装包 fixture，以及带 `/zero-preview/` base path 的 noindex 版本；它们只进入忽略的 `website/output/fixtures/`，不会改实际发行清单或 `website/dist/`。同时覆盖 axe AA、双语路由、四种屏宽、键盘、无 JS、减少动效、720px 重排（1440px 在 200% 缩放下的等效 CSS 视口）和无自动下载。

`.github/workflows/website-check.yml` 使用只读仓库权限，在网站子目录安装、检查和测试，保存浏览器报告。它不执行桌面构建、发布或部署。在线链接检查和 Lighthouse 为显式入口，不依赖网络的内容/schema 校验仍在普通 check/build 执行。

## 文案与截图

- `website/src/content/site.ts`：中文/英文内容、工具介绍与公开项目链接。新增字段须两种语言齐全。
- `website/src/content/catalog.ts`：发行 schema、工具/profile/平台约束。
- `website/src/content/releases.json`：实际发行清单，当前为 `unavailable`、空 packages。
- `website/src/content/assets.json`：四张真实 Awake 界面的来源、版本、平台、日期、SHA-256 和隐私审阅。
- `website/src/content/documentation.ts`：双语工具/安装/FAQ 文档、稳定 section ID、来源与手动维护的内容核对日期。
- `website/src/content/seo.ts`：canonical URL 与共享 WebSite / SoftwareApplication / SoftwareSourceCode / WebPage 实体图；不编造评分、价格或公开发行版本。
- `website/src/content/ai-index.ts`：从上述内容生成 AI 摘要与全文；更新发行清单后重建即可同步当前获取状态。
- `website/src/styles/site.css`：浅画布、石墨文字、冷青强调、深演示区与响应式样式。
- `website/src/styles/fonts.css`：继续使用 Fontsource 的 IBM Plex 文件，采用 optional 显示与正文/标题预加载，慢网保留系统回退字体，避免字体迟到后改变布局。

`test:seo` 读取最新 `dist/`，须先 build；检查唯一标题、双语 metadata、JSON-LD 关联、完整 sitemap 页面集合（当前四工具增量为 28 页）、静态内链/锚点、AI 索引和 Vercel 404 配置目标。CI 已在 build 后运行它。内容核对日期只在实际复核内容时更新，不以每次构建时间冒充内容更新。

截图复用 2026-10-11 的 macOS v0.1.0 full debug 验收素材。截图含开发版 File 目录；网站旁注明 standard 不含 File。替换图片时使用安全样例并更新来源与摘要，不展示私人文件、路径、剪贴板、屏幕内容或凭据。此记录不代表新的 Windows/原生设备验收。

品牌 SVG 来自仓库 canonical 图标；IBM Plex Latin 字体随静态资源提供，中文使用系统字体回退。SIL OFL 许可位于 `website/public/licenses/ibm-plex.txt`。`public/social.svg` 为自有品牌分享图，prebuild 使用 Sharp 生成忽略的 `public/social.png`。

## 更新发行目录

只有实际公开的 `bells/zero` Release asset 才能加入直链。不要填草稿、Actions 临时产物、猜测的安装包地址或身份验证 token。逐项核对：

1. 版本、发布日期、核对日期、`trial`/`stable` 和 `published` 可见性。
2. `standard` 工具恰为 Awake/Paper/Snap/Launch；`core` 无内置工具；File 仍不在此目录。
3. macOS 的 `aarch64`/`x86_64` + DMG，Windows 的 `x86_64` + MSI/EXE。用户通过对应架构条目的下载链接主动选择，不检测处理器。
4. 精确 URL、bytes、SHA-256 和公开 Release 来源。签名字段须来自实际签名/公证检查，构建成功不足以证明签名或设备支持。
5. 运行以下联网验收后再接受清单更新；普通构建仅校验结构与一致性。

```bash
pnpm --dir website verify:links
```

如需本机代理，可为该命令设置 `HTTP_PROXY=http://127.0.0.1:1087 HTTPS_PROXY=http://127.0.0.1:1087 NODE_USE_ENV_PROXY=1`。此脚本查询公开 Release、核对可见性/channel/asset/大小/校验值并检查链接，报错会指出具体条目。脚本不读取凭据。无 API digest 时会下载文件计算摘要，因此清单增加大文件后需要更长验收时间。

无包或所选平台/profile 缺包时显示试用说明与 GitHub Releases；只有其他平台有包时也不跳到不兼容安装包。首页只在有 standard 公共包时显示下载 CTA。Actions 登录和过期限制在安装说明中可见。

## 性能验收

先构建并在一个终端运行 `pnpm --dir website preview`，再在另一个终端执行：

```bash
WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website verify:performance
```

脚本用本机 Chrome 和 Lighthouse 13.5.0 检查原四个页面和代表性的 Snap、双语安装指南、英文 FAQ 共八页，固定 mobile simulated throttling、390×844、DPR 1，逐页清除 Lighthouse 存储。目标为 performance/accessibility ≥95、LCP ≤2500ms、CLS ≤0.1、初始内联/外部 JS gzip ≤50 KiB、首屏资源 ≤1 MiB。资源预算保守累加首屏请求的未压缩正文。结果保存在 `website/output/performance/`，属于本地实验室结果，不代表真实访客网络、服务器/CDN 或桌面原生性能。

## 静态部署与回退

默认构建使用 `https://www.usezero.cn`。2026-10-12 已读取生产响应和 Vercel 项目：官网已上线，`usezero.cn` 以 308 跳转到 `www.usezero.cn`，两域名均已绑定验证。本次搜索/AI 增量尚未提交、推送或部署。

Vercel 配置位于 `website/vercel.json`，项目 Root Directory 应为 `website`（或从 `website/` 运行 CLI 部署），Framework 为 Astro、Node 为 24.x、Build Command 为 `pnpm build`、Output Directory 为 `dist`。连接返回的项目/部署信息未暴露 Root Directory，不能据此断言当前项目已读取该配置。若从仓库根部署并自定义 output path，须让对应配置位于实际项目根并调整路径，再预览验收。

配置在 filesystem 匹配前处理 `/404`、`/404.html` 和 `/en/404` 的各种直接形式，返回 404 与 `X-Robots-Tag: noindex, nofollow`；filesystem 后的未命中路由返回本地化 404。英文目标是 Astro 实际生成的 `/en/404/index.html`。错误 HTML 自身也带 noindex，移除 canonical/hreflang 和产品 JSON-LD；AI 文本用 noindex 响应头避免被当普通搜索落地页，但不在 robots 禁止读取。配置已核对官方 routes schema；Astro 本地 preview 不执行 Vercel routes，HTTP 状态仍须在部署预览/生产中检查。

临时预览须排除索引：

```bash
SITE_PREVIEW=1 pnpm --dir website build
```

Vercel 的 `VERCEL_ENV=preview` 自动启用同一模式：HTML noindex、robots 禁止抓取、AI 文本索引禁用且不输出产品实体。生产构建可以不设置 SITE_PREVIEW，也可显式设为 `0`；字符串 `0` 不再被当成真值。

子路径托管需要在构建时设置 base（以 `/` 开始和结束），例如：

```bash
SITE_BASE=/zero/ SITE_PREVIEW=1 pnpm --dir website build
```

环境变量影响 HTML、导航、图片、canonical、sitemap 和 robots；切换环境后必须重建。将 `website/dist/` 作为完整静态产物交付，托管服务需支持目录 `index.html` 和 `404.html`。其他静态宿主需配置等价的错误响应，不能将所有未命中路径重写到返回 200 的首页。

部署前复核公开目录、在线链接、HTTPS/base path 与 preview/production metadata，保留上一静态产物和清单。出现问题时整体回退到上一产物；不迁移应用用户数据，也不改已下载安装包。部署、DNS、推送、发布、OpenSpec sync 和归档仍按独立请求执行。

## 搜索平台登记（待账号验证）

用户已确认尚未验证 Google Search Console / Bing Webmaster Tools，本轮先完成官网代码。

1. 在 Google Search Console 添加 `usezero.cn` 的 Domain property，按其提供的实际 TXT 值完成 DNS 验证；不要在源码放猜测的验证值。
2. 验证后提交 `https://www.usezero.cn/sitemap-index.xml`，检查首页、下载和代表说明页的 URL inspection / Page indexing。
3. 在 Bing Webmaster Tools 验证站点，也可从已验证的 Search Console 导入，再提交同一 sitemap。
4. 重新部署本轮源码后，确认 18 页 sitemap、AI 文件、英文/未知路径的 404 与 production index / preview noindex；观察抓取和收录报告。通过本地测试不代表已被搜索引擎收录。

## 在线工具箱（2026-10-14）

新增 `/tools/` 和 `/en/tools/` 目录及 `timestamp/`、`json/`、`base64/` 三个交互工具，共增加 8 个可索引页面（全站 26 页，另有两个 noindex 错误 HTML）。已有 `/tools/{snap,launch,awake,paper,file}/` 桌面说明页保持原路径。主导航区分桌面工具与在线工具。

- `src/content/web-tools.ts` 维护中英说明、FAQ 和工具清单，并组合 `src/content/web-tool-guides.ts` 中的搜索标题、步骤、输入/输出示例及浏览器 Agent 说明。新增工具时两语言都须补齐指南；示例应使用合成数据，并通过实际计算逻辑核对。导航名称保持简短，搜索标题单独描述能力。
- 目录描述列出四工具；工具说明提供 `#usage`、`#steps`、`#examples` 和 `#agent-usage` 静态锚点。页面和 `llms-full.txt` 共享步骤、保留换行的示例、输入/输出方法、动作、限额和本地处理边界，WebApplication 的 `featureList` 使用同一动作清单。Agent 说明针对真实浏览器控件，不代表新增 HTTP API 或 MCP。纯静态指南不进入浏览器可执行脚本。
- `src/lib/web-tools/` 是不依赖 DOM/Astro/Tauri 的纯 TS 计算、契约和任务管理。后续桌面离线插件可评估复用此层；当前没有桌面插件交付或 PWA 首次离线访问能力。
- `src/scripts/web-tools/` 接入原生控件、主题、搜索与 worker。CodeMirror 6 仅在点击“启用增强编辑”后加载；`jsonc-parser` 严格模式保留源数字/重复键；`image-meta` 在完整图片解码前读取类型与尺寸，预览仅接受 PNG/JPEG/WebP。
- 工具输入/结果/文件/搜索词只保留在当前页，不上传、不放进 URL/站点存储/日志；主题是唯一存储例外，键为 `zero.web-tools.theme`。Clipboard/下载均须明确操作。清空/离页释放工具状态和 Blob URL；浏览器自身恢复机制不属于安全擦除保证。
- 时间输入限制 256 字符；文本/JSON 输入 1 MiB UTF-8，输出 8 MiB，JSON 深度 128；图片原始/解码 5 MiB、编码输入 7 MiB、1600 万像素。处理超过 5 秒会中止，允许取消/重试，过期结果不得恢复复制或导出。
- 依赖升级在网站子目录完成，继续使用独立锁文件。MIT 运行时依赖与传递依赖的许可文本位于 `public/licenses/web-tools.txt`，升级时核对并同步对应版本；维护选择和验收来源见 `openspec/changes/usezero-web-tools-extension/evidence/implementation.md`。

`pnpm --dir website test` 包含纯逻辑/任务测试，`test:browser` 包含新工具交互、浅深 axe、合成私有标记不出网/不落盘、旧页面回归、preview/base path。`verify:performance` 覆盖原有代表页及双语在线目录/三工具；增强编辑和大输入另行记录，初始预算不包含由用户明确触发的增强包。检查输出在忽略的 `website/output/`，不是线上或桌面设备证明。

在线 CTA 只跳转到受发行清单控制的下载/试用页，不直接猜测平台包。桌面离线插件是后续规划；当前仍须明确其尚未内置，不能写成已支持桌面快捷调用这些工具。

## 批量时间戳与文本对比（2026-10-15）

本次增量在原时间戳页内提供单条/批量模式，并增加 `/tools/diff/`、`/en/tools/diff/`。当前目录/搜索为四个在线工具，索引页面由 26 增至 28，另有两个 noindex 错误 HTML。此前日期的三工具/26 页记录保留其历史语义；本地工作区验证不表示已部署。

- `components/webTools/TimestampWorkspace.astro` 和 `scripts/web-tools/timestamp-batch.ts` 负责模式、分页及导出；`lib/web-tools/timestamp-batch.ts` 复用原严格解析。批量最多 1,000 个物理行、总计 1 MiB UTF-8、每行 256 字符；LF/CRLF/CR 分行，空白行跳过，原行号/原文及失败原因保留。每页最多 100 行，完整结果复制/下载为版本化 JSON，不提供 CSV/TSV。改变输入/设置或模式后须重新执行。
- `components/webTools/DiffWorkspace.astro` 与 `scripts/web-tools/diff*.ts` 负责双侧输入、文件读取、结果导航和展示；`lib/web-tools/text-diff*.ts` 提供纯 TS 验证、比较模型和有界展示窗口。`diff@9.0.0` 仅在主动比较后由独立 worker 加载，BSD-3-Clause 许可见 `public/licenses/text-diff.txt`；[选型依据](../openspec/changes/extend-web-tools-batch-and-diff/evidence/dependency.md)记录了官方来源与核验时间。
- 文件限 UTF-8 纯文本（可带 BOM）；其他编码、NUL 和常见二进制签名拒绝，不按扩展名猜测有效性。支持代码、JSON、Markdown、CSV 等纯文本，不解析图片、PDF、Word、Excel 或文件夹。每侧最多 1 MiB、20,000 行，合计 2 MiB；仅统一 CRLF/CR 到 LF，保留其他空白、大小写、Unicode 和终止换行差异。
- 对比支持并排/统一视图、增删行数、差异块导航和行内高亮；≤720px 首次加载默认统一。单行超过 4,096 码点或行内累计超过 100,000 码点则提示并退回整行高亮。默认三行上下文，折叠/分页/长行分段可访问完整结果，一次最多挂载 400 文本行及 200 KiB 源文。
- 新旧任务使用显式操作联合和泛型 runner，保留旧处理器契约；新功能使用专用 worker。读取与处理 5 秒超时、可取消，过期结果/晚到读取不得覆盖新内容；所有序列化结果最多 8 MiB。输入、文件名和结果不进入网络、URL、console、站点存储；主题 enum 仍是唯一持久化例外。

网站检查继续在 `website/` 独立运行，完整浏览器/SEO/性能入口已包括新页面，子路径 fixture 包含新 worker。当前验收、实测数据和边界见[本次记录](../openspec/changes/extend-web-tools-batch-and-diff/evidence/implementation.md)。本次不触及桌面源码、发行清单、原生运行、DNS 或搜索平台登记。

## 按需反馈（2026-10-17，本地实现，默认禁用）

双语在线目录及 timestamp/json/base64/diff 共十页接入 `components/webTools/Feedback.astro`，线程分别固定为 `tools`、`tools/timestamp`、`tools/json`、`tools/base64`、`tools/diff`。线程不含 locale/base，旧桌面说明路由不接入。共享 `Page.astro` 只提供入口，主站不运行 Waline 或管理后台代码。

`src/lib/feedback/config.ts` 校验启用配置，`src/scripts/web-tools/feedback.ts` 在点击后创建异源 iframe；激活前不预连接或请求反馈服务。iframe 只传 allowlist 线程和语言，禁用 referrer、弹窗、顶层导航、下载、剪贴板和设备权限。父页只接受精确 origin、对应 contentWindow、严格字段和 240–1600px 高度范围的 ready/resize/error；12 秒未就绪可显式重试/关闭，工具状态保留。服务的请求超时为 8 秒，不自动重发未知结果。

官网构建环境：

| 变量 | 含义 |
| --- | --- |
| `PUBLIC_FEEDBACK_ENABLED` | 仅 `1` 启用，缺省关闭 |
| `PUBLIC_FEEDBACK_ORIGIN` | 已验收的独立 HTTPS 生产 origin，无路径/凭据/查询串 |
| `PUBLIC_FEEDBACK_PREVIEW_ORIGIN` | 独立预览 origin；预览不回退到生产，规范化后与生产相同也拒绝 |
| `FEEDBACK_ALLOWED_ORIGINS` | 逗号分隔的明确 origin 白名单；须包含实际选用地址 |
| `FEEDBACK_LOCAL_TEST` | 仅本地 fixture 使用 `1` 允许 loopback HTTP，生产不能使用 |

缺失、非法、同主站来源或不在白名单时只显示准确的不可用信息和 GitHub 支持链接；不会显示能提交的假表单。所有配置只提供地址/开关，不得放入数据库或管理员秘密。`Layout.astro` 为在线工具输出限制 frame-src 的 CSP；反馈服务另行通过 HTTP 头限制 frame-ancestors。配置改变后需要重建，预览还须使用隔离数据库、管理员和服务端秘密。

这是独立运维服务，非全托管评论产品。访客只需正文，昵称/邮箱可选；全量待审，邮箱仅站长可见，正文按纯文字公开，站长身份由认证角色决定。没有自动邮件、头像、外部反垃圾、附件或投票。工具输入/结果/文件/搜索仍本地处理，不自动附入反馈；主动填写的反馈上传到独立服务。云商可能保留连接元数据，不承诺网络匿名、自动回复或反馈自动到期。

服务维护、受控管理员初始化、审核/升级、配额巡检、暂停、私密导出与隔离恢复、删除及实际保留边界见 [feedback/README.md](../feedback/README.md)。来源摘要有逻辑过期和请求时清理/CLI，但尚无托管周期清理，不能声称空闲时物理保留不超过 24 小时。启用前必须验证周期清理、账号资格/零新增费用、区域、日志/备份到期、函数/导出上限、部署及 Chrome/Safari 实际行为；当前不启用服务或创建云资源。

`pnpm --dir website verify:fixtures` 额外生成 `/feedback-review/` 隔离预览，使用 4323 本地反馈服务。`feedback/` Chrome suite 运行两个真实本地 HTTP 来源；原生接口负向矩阵、待审/审核/回复、存储受阻、私密标记、故障与幂等重试的证据与模拟故障范围见[本次验收](../openspec/changes/add-web-tools-feedback/evidence/implementation.md)。主站完整 SEO/浏览器/性能检查仍独立执行，点击后的反馈资源另计，不混入“未点击零反馈连接”的初始预算。
