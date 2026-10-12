# 官网搜索与 AI 可发现性增量验收

日期：2026-10-12（Asia/Shanghai）。本轮由用户授权一并实施审计发现，随后明确“尚未验证搜索平台，先完成官网代码”。原官网已部署；本轮源码尚未提交、推送或部署，不包含 DNS 修改、搜索平台验证/提交、spec sync 或归档。

## 交付

- 18 个可索引 HTML 页面：原双语首页/下载，加双语 Snap、Launch、Awake、Paper、File、安装指南、FAQ。文档包含实际用途、步骤、平台/交付边界、核对日期与来源；主站内链、语言切换和 sitemap 同步接入。
- 首页/下载搜索标题明确产品用途，沿用页面视觉口号。JSON-LD 以稳定 @id 关联 WebSite、SoftwareApplication、SoftwareSourceCode 与当前 WebPage；codeRepository 只在源码实体，不伪造报价、评分或已发行版本。
- llms.txt 的事实摘要来自双语 FAQ；文档索引与 llms-full.txt 全文来自同一 typed 内容和发行目录。没有单独维护第二套产品事实。它们是发现补充，不保证 AI 引用或排名。
- 错误 HTML noindex，不输出 canonical/hreflang 或产品 JSON-LD。Vercel routes 对显式错误路径和未命中路径配置本地化 HTTP 404，英文目标与实际产物 `/en/404/index.html` 匹配；AI 文本响应头 noindex，仍可供工具读取。
- Vercel Preview 自动禁用发现；显式 SITE_PREVIEW=0 维持生产索引。测试覆盖 manual preview/base path 和 VERCEL_ENV=preview，robots 与 AI 文件同步。
- Fontsource IBM Plex 文件保留，正文/标题预加载、font-display optional：字体迟到时保持系统回退，避免英文首屏换字体后跳动。

## 本地验证

环境：macOS arm64、Node v24.20.0、pnpm 10.33.0、Chrome 154.0.8037.99、Playwright 1.64.0、Lighthouse 13.5.0。地址 `http://127.0.0.1:4321/` 为生产静态预览。Browser 技能未提供，使用仓库现有 Playwright/Chrome 流程。

| 检查 | 结果 |
| --- | --- |
| 网站 check | 内容/双语键/文档校验通过；Astro 0 errors、0 warnings、0 hints |
| 网站 test | 6/6 发行 schema、选择与链接验收逻辑通过（网络行为用注入数据验证） |
| 网站 build | 20 个 HTML 页面（18 个正常页、2 个错误页）及两个 AI 文本索引、robots、sitemap 构建通过 |
| test:seo | 7/7 生成产物检查通过，覆盖唯一标题、对称语言 metadata、实体关联、错误页排除、18 页 sitemap、AI 文本 URL 与静态内链/锚点、404 配置目标 |
| 隔离 fixture | 公开包样例、无包、preview/base path、Vercel Preview、显式 SITE_PREVIEW=0 全部通过；虚构包只在忽略的 output 内 |
| Playwright / axe | 29/29；所有 14 个新增页面、无 JS、双语导航、锚点保持、错误 HTML、320/390/720/1440px、原首页 768px、键盘、reduced motion、200% 等效重排和无自动下载通过 |
| 页面/控制台 | 标题与内容对应、每页有实际说明；新增页面无 pageerror / console error，axe 无 AA 违规；未观察到框架错误页 |
| 交互 | 首页 Snap 使用说明 → 平台边界锚点 → 英文相同页面/锚点 → 安装指南 → FAQ；保持内容与路由一致 |
| 视口截图 | 中文 390×844 安装首屏及校验段落、英文 1440×1000 安装首屏人工检查可读；本机全页截图曾重复首屏，因此视觉结论使用视口截图与滚动后独立截图 |
| OpenSpec / 差异 | `openspec validate --all --strict` 28/28；`git diff --check` 通过。已有 icon-system 归档提示仍存在，不属于本轮 |

## 性能与回归证据

首轮英文首页 performance 96、CLS 0.112739 超过 ≤0.1 预算。Lighthouse 指向 `.hero-preview`；延迟 WOFF2 1 秒的回归测试重现其 y 从 564.203125 变为 502.203125（移动 62px），在修复前失败，修复后位置保持 564.203125。没有放宽预算或删除测试。

最终八页 performance/accessibility 均 100，CLS 均 0，LCP 1427–1655ms；初始可执行 JS gzip 238–639 bytes，首屏资源正文保守累加 115479–140233 bytes，全部预算通过。代表页面为双语首页/下载、中文 Snap、双语安装指南、英文 FAQ。结果为本地移动端模拟实验，不是生产用户 Core Web Vitals 或其他浏览器/设备证据。

另一个回归已重现：旧条件将字符串 SITE_PREVIEW=0 当成真值。生产 fixture 在修复前错误输出 noindex，新增断言失败；集中使用显式 true / '1' / Vercel Preview 判断后，生产索引和预览禁用都通过。

详细汇总：本目录的 `discovery-performance-first-2026-10-12.json`、`discovery-performance-2026-10-12.json` 与 `discovery-browser-2026-10-12.json`。截图位于本机忽略的 `website/output/screenshots/install-{zh,en}-{1440,390}.png`；独立滚动校验截图为 `/private/tmp/zero-seo-install-verify.png`。本轮不改桌面源码，未重复桌面/Rust/原生设备门禁。

## 外部状态与后续

只读 Vercel 连接确认 Zero 项目为 Astro、Node 24.x，当前生产部署 READY；www.usezero.cn 与 usezero.cn 已验证绑定，裸域名 308 跳转至 www。响应与初轮审计亦确认 HTTP→HTTPS、canonical、双语 hreflang、robots、sitemap 和分享图可访问。

连接返回的项目/部署信息不包含 Root Directory，且源码文件树接口返回 not_found；因此未确认当前项目是否读取 website/vercel.json。配置的 routes 部分通过当前官方 JSON schema；宿主 HTTP 404 仍须部署预览验证，不能用 Astro preview 的响应替代 Vercel 执行结果。按 docs/website.md 设置 website 项目根（或从该目录 CLI 部署），重新部署后检查合法 18 页仍为 200、错误路径为 404、生产与预览索引模式正确。

Google Search Console / Bing Webmaster Tools 尚未验证，sitemap 尚未在这些账号中提交，未声称已收录。用户选择先交付代码；验证/提交步骤已写入 docs/website.md。生产部署、提交/推送、DNS、发布、spec sync 与归档均未执行。
