## 1. 网站隔离与内容骨架

- [x] 1.1 在 `website/` 建立独立 Astro 静态项目、严格 TS、独立 pnpm 10.33.0 锁文件与输出忽略规则；核对官方依赖兼容性，通过 `pnpm --dir website install --frozen-lockfile`、`pnpm --dir website check` 和 `pnpm --dir website build`，确认不执行桌面 prebuild。
- [x] 1.2 建立共享工具结构、中文/英文内容与版本化发行清单 schema；校验双语键、工具 ID、profile/平台/架构、必需字段和允许 URL，通过有效数据与缺译/非法清单的针对性检查。
- [x] 1.3 复核最新打包、OCR、File 与公开插件证据，形成官网事实表并记录来源/日期；审阅确认四工具 standard、无工具 core、File 未发行及 Snap 平台差异均与源码/文档一致。

## 2. 视觉系统与真实产品素材

- [x] 2.1 接入现有 canonical Ø/工具 SVG，建立浅画布、石墨文字、冷青强调与深演示区的颜色/排版/间距规则；核对字体许可并本地提供必要子集，在 1440px 和 390px 预览确认品牌一致、正文可读和 AA 对比度。
- [x] 2.2 使用安全样例采集快速入口、main 工作区和相关工具真实界面，记录版本/profile/platform/日期；审阅素材确认无私有数据，macOS 图片标明平台，未交付功能不作为当前包演示。
- [x] 2.3 制作“一行入口关联完整工作区”的主视觉、响应式图像和静态降级状态；在 1440px/768px/390px/320px 及无 JS 模式检查图文关系、alt、尺寸保留与加载策略。

## 3. 双语产品页与交互

- [x] 3.1 实现中文/英文首页、统一导航与语言切换、工具/使用方式锚点和 404；浏览器验证等价路由与锚点保持，首屏可回答产品用途和获取方式。
- [x] 3.2 实现快速操作/完整工作区展示与工具选择增强，提供静态界面序列和减少动效路径；键盘及触摸检查选中状态、可访问名称、焦点与 44px 点击区域，确认不触发原生操作或自动下载。
- [x] 3.3 实现四工具场景、独立 File 开发状态、平台差异与 FAQ/GitHub/文档入口；按事实表逐条审阅中文/英文文案，确认 OCR、第三方 runtime、联网能力和移动端均无过度承诺。

## 4. 下载目录与未发布状态

- [x] 4.1 复核 Zero 实际公开 Release/试用入口并填充真实清单；无公开包时采用 unavailable 状态，通过来源记录验证版本、可见性、产物名、SHA-256、bytes、工具集合与签名说明，不生成猜测的 asset URL。
- [x] 4.2 实现双语下载页、显式平台/架构选择和 standard/core 说明；浏览器验证平台切换会清除不兼容选项，未知/手机/Linux 访客能查看所有实际可用选择，无 JS 时仍可获得相同关键信息。
- [x] 4.3 实现无公开包、部分平台缺包和 trial 状态，以及主页 CTA 的相应降级；用状态 fixture 验证不会显示草稿直链、残留下载地址、自动下载或 File 包含承诺。
- [x] 4.4 提供独立公开链接验收入口与清单更新说明；联网核对实际公开链接，使用失效/草稿/错误版本样例确认会报告对应条目，离线常规构建仍能完成结构校验。

## 5. SEO、性能与独立交付

- [x] 5.1 配置双语 metadata、canonical/hreflang、sitemap/robots、分享图与真实 SoftwareApplication 信息；检查生成 HTML 和 preview/production 输出，确认语言、域名/base path、noindex 模式和结构化内容准确。
- [x] 5.2 优化首屏图片、字体与脚本加载；测量每页初始 JS gzip ≤50 KiB、首屏传输 ≤1 MiB，在固定移动端 Lighthouse 协议下验证 performance/accessibility ≥95、CLS ≤0.1 和 LCP 目标 ≤2.5s，并保存实验环境与限制。
- [x] 5.3 新增独立网站检查 CI 和 `docs/website.md`，补 README 开发入口；检查只读权限、子目录锁文件与命令，确认不会触发桌面发布/部署，按文档复现本地静态构建。

## 6. 综合验收与实施完成记录

- [x] 6.1 运行网站 check/build 及必要的 Playwright/axe 流程，覆盖双语导航、包选择、错误清单、无 JS、reduced motion、键盘、长英文、200% 缩放和 320/390/768/1440px；保存可复现结果和页面截图，人工审阅主视觉与实际链接。
- [x] 6.2 运行根 `pnpm test`、`pnpm build` 与 `node scripts/performance/build-graph.mjs --check --output /tmp/zero-website-desktop-build-graph.json`，检查桌面模块/输出未混入网站资源；不改原有历史 evidence 或 File 审批，不重复把官网检查当桌面设备验收。
- [x] 6.3 运行 `openspec validate --all --strict` 和 `git diff --check`，记录实际实现、浏览器/性能结果及仍未就绪的平台和发行事项；交付本地预览与更新指引，维持部署、DNS、推送、发布、spec sync 和归档为独立授权范围。

## 7. 搜索与 AI 可发现性（2026-10-12 增量）

- [x] 7.1 为双语首页/下载页设置明确产品类别的搜索标题；建立共享软件、网站、页面与源码实体，404/preview 不输出产品结构化数据。
- [x] 7.2 增加双语 Snap/Launch/Awake/Paper/File 说明、安装指南与 FAQ；沿用现有视觉、静态内容与发行事实，补内链、来源、核对日期及语言对应。
- [x] 7.3 从共享内容生成 llms.txt 与 llms-full.txt；包括产品/平台/发行边界、可引用链接和信息日期；preview 不暴露生产发现索引。
- [x] 7.4 增加 Vercel 静态配置，直接错误页 noindex、英文错误页避免返回正常 200；保持其他合法路由，记录托管状态与 HTML metadata 的证据区别。
- [x] 7.5 增加生成产物检查及浏览器回归，覆盖新双语页面、无 JS、语言切换、sitemap、JSON-LD、AI 文件和 preview/base path；运行网站 check/test/build/browser/performance 与 OpenSpec/差异检查。
- [x] 7.6 更新官网维护和项目地图，记录本次验证及 Search Console/Bing 域名验证、sitemap 提交和生产部署状态；不将本地验证当作已收录或线上已更新。

本轮代码与本地验收已完成，见 `evidence/discovery-verification-2026-10-12.md`。用户明确先完成官网代码；生产部署、托管 HTTP 404 验证及搜索平台验证/提交仍待后续执行。
