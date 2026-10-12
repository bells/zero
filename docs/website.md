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

`test:seo` 读取最新 `dist/`，须先 build；检查唯一标题、双语 metadata、JSON-LD 关联、18 页 sitemap、静态内链/锚点、AI 索引和 Vercel 404 配置目标。CI 已在 build 后运行它。内容核对日期只在实际复核内容时更新，不以每次构建时间冒充内容更新。

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
