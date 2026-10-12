# Zero 官网维护

官网在 `website/`，使用 Astro 静态输出。它有独立依赖、锁文件和构建，不使用桌面 React/Tauri、IPC、File 引擎或根项目的 prebuild。中文为 `/`、`/download/`，英文为 `/en/`、`/en/download/`。

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
- `website/src/styles/site.css`：浅画布、石墨文字、冷青强调、深演示区与响应式样式。

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

脚本用本机 Chrome 和 Lighthouse 13.5.0 检查四个页面，固定 mobile simulated throttling、390×844、DPR 1，逐页清除 Lighthouse 存储。目标为 performance/accessibility ≥95、LCP ≤2500ms、CLS ≤0.1、初始内联/外部 JS gzip ≤50 KiB、首屏资源 ≤1 MiB。资源预算保守累加首屏请求的未压缩正文。结果保存在 `website/output/performance/`，属于本地实验室结果，不代表真实访客网络、服务器/CDN 或桌面原生性能。

## 静态部署与回退

默认构建使用源码约定 `https://www.usezero.cn`。上线前核实实际域名归属和托管配置；域名只是 metadata 约定，不证明已有生产站点。

临时预览须排除索引：

```bash
SITE_PREVIEW=1 pnpm --dir website build
```

子路径托管需要在构建时设置 base（以 `/` 开始和结束），例如：

```bash
SITE_BASE=/zero/ SITE_PREVIEW=1 pnpm --dir website build
```

环境变量影响 HTML、导航、图片、canonical、sitemap 和 robots；切换环境后必须重建。生产版本不设置 `SITE_PREVIEW`，将 `website/dist/` 作为完整静态产物交付，托管服务需支持目录 `index.html` 和 `404.html`。英文未命中路由是否使用英文 404 由托管路由配置决定。

部署前复核公开目录、在线链接、HTTPS/base path 与 preview/production metadata，保留上一静态产物和清单。出现问题时整体回退到上一产物；不迁移应用用户数据，也不改已下载安装包。部署、DNS、推送、发布、OpenSpec sync 和归档仍按独立请求执行。
