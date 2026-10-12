# 官网实施与验收记录

核对日期：2026-10-12。变更：`add-zero-product-website`。本地网站、网站测试和桌面构建隔离分别记录，官网验收不代表安装器、Windows 设备或新一轮原生功能验收。

## 实际交付

独立 Astro 静态项目位于 `website/`，提供中文/英文首页、下载页和 404。使用现有 Ø 品牌 SVG、本地 IBM Plex 字体、浅画布/石墨文字/冷青强调与深色真实界面展示，说明快速入口和完整工作区的关系。工具介绍、FAQ、语言路由、下载信息和图片不依赖客户端 GitHub API；无 JS 可阅读全部关键内容。轻量脚本增强截图表面切换、工具介绍选中状态与平台/profile 筛选。

`docs/website.md` 说明构建、内容、清单、截图、性能、base path/noindex、静态部署及回退。独立 `website-check.yml` 使用只读权限、Node 24、pnpm 10.33.0 与子目录锁文件，不执行桌面发布或远端部署。仅检查了工作流语法/配置，尚未在 GitHub 托管 CI 运行。

## 官网事实表

| 页面事实 | 当前证据与边界 |
| --- | --- |
| Zero 是桌面工具箱，有状态栏/托盘快速操作与完整主窗口 | `PRODUCT.md`、`docs/project-overview.md`；网页自适应手机不表示有手机应用 |
| standard 为 Awake/Paper/Snap/Launch，core 无内置工具 | `docs/packaging.md`、`scripts/build-profile.mjs`；两者共用应用身份，不是两个并行独立应用 |
| File 开发中，未进入 standard | `docs/packaging.md`、`docs/plugins/zero-file-offline-engines.md`；不改变 File 签名引擎发行批准 |
| Snap macOS 自定义截图/编辑，Windows 打开系统截图工具 | `src-tauri/src/services/screenshot.rs`、项目地图；不把 macOS 图片当作 Windows 功能证明 |
| OCR 不宣传为公开包已交付，第三方 runtime 尚未开放 | `enhance-snap-and-share-offline-ocr`、`standardize-zero-plugin-protocol` 及项目地图；网页不执行或安装原生工具 |
| Paper 新壁纸、下载/查看更新需要联网 | 壁纸服务与项目地图；未声称整个应用完全离线 |
| 实际公开 Release 为 0，五个项目入口 HTTP 200 | `release-check-2026-10-12.json`；仅公开读取，不猜测私有/草稿资产 |
| 当前试用包未接入开发者证书签名/公证/Authenticode | `docs/packaging.md`；如未来新增包，按包的实测签名字段和安装条件重新核对 |
| canonical 为 `https://www.usezero.cn` | 现有 About 链接约定 `src-tauri/src/commands/diagnostics.rs`；不代表 DNS 或生产部署已完成 |

四张原生图片复用 2026-10-11 的 macOS v0.1.0 full debug Awake 记录，来源与摘要在 `website/src/content/assets.json`。图片只含未启用的 Awake 控制及工具名称，无私人内容；full 目录含 File，旁边说明 standard 不含 File。本轮没有重新采集应用原生截图。网站页面截图为本轮浏览器生成，已人工审阅中英文首屏、完整中文页面和手机下载页；本目录保存桌面/手机首页截图，其余截图在忽略的 `website/output/screenshots/`。

## 检查结果

环境：macOS arm64，Node v24.20.0、pnpm 10.33.0、Chrome 154.0.8037.99、Lighthouse 13.5.0；独立锁文件固定 Astro 7.3.8。

| 检查 | 实际结果 |
| --- | --- |
| 网站 frozen-lockfile 安装及随后同 store 离线安装 | 通过；重装 369 个锁定依赖，没有改根依赖 |
| `pnpm --dir website check` | 双语键/品牌副本/图片 SHA-256 校验通过；25 文件，0 errors/warnings/hints |
| `pnpm --dir website test` | 6/6；profile/平台/版本/草稿/缺译/重复数据/在线失效资产；API 无 digest 时下载计算 SHA-256 |
| `pnpm --dir website build` | 六个 HTML 页面和 robots/sitemap，12 个 WebP；网站构建未执行桌面 prebuild |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website test:browser` | 13/13，无 skipped/flaky；详见 `browser-summary-2026-10-12.json` |
| `verify:fixtures`（浏览器前置） | 隔离源码副本构建 trial 双架构 macOS standard、stable Windows core 和部分缺包；实际 catalog/dist 不包含虚构包。另验证 `/zero-preview/` noindex、资源与语言路由 |
| `verify:links` | 0 公开 asset、5 项目链接通过。真正包下载仍无公开资产可验证；模拟断链/错误版本/草稿只属于 fixture 证据 |
| 根 `pnpm test` | 362/362 |
| 根 `pnpm build` | 串行重跑通过；保留既有大 chunk 提示，没有改变预算 |
| 独立桌面构建图 `--check --output /tmp/zero-website-desktop-build-graph.json` | findings 和 forbiddenEagerImports 均为空；入口 282451 bytes / gzip 86996 bytes，未混入 website 模块 |

浏览器测试覆盖四页面、1440/768/390/320px、axe WCAG AA、双语路由与锚点、键盘及可见焦点、移动导航/44px 操作目标、无 JS、减少动效、720px 重排、metadata、404、安装包平台/profile/架构切换及无自动下载。720px 为 1440px 在 200% 缩放下的等效 CSS 视口。

另外通过 CUA 在本机实际 Chrome 新标签页将缩放调整至 **200%**（AX 返回“缩放比例：200%”），查看中文首页，切到英文首页与英文下载页，再切换 Windows 和 core；页面标题/正文可读，导航和单选操作可达，AX 确认 Windows/core 选中及正确缺包状态。完成后恢复 **100%** 并停在中文首页。未将含浏览器个人书签的整窗截图写入仓库。

## 性能

`performance-summary-2026-10-12.json` 保存最终四页结果。协议：本地 production 静态预览，Lighthouse mobile simulated throttling、390×844、DPR 1，Lighthouse 逐页清除存储；首屏预算保守累加请求的未压缩正文，JS gzip 包括内联和外部可执行脚本。

| 路由 | Performance / Accessibility | LCP | CLS | JS gzip | 首屏正文 |
| --- | --- | --- | --- | --- | --- |
| `/` | 99 / 100 | 1579ms | 0 | 639 B | 134187 B |
| `/en/` | 99 / 100 | 1579ms | 0 | 639 B | 135822 B |
| `/download/` | 100 / 100 | 1503ms | 0 | 465 B | 113582 B |
| `/en/download/` | 100 / 100 | 1502ms | 0 | 465 B | 113852 B |

四页满足 performance/accessibility ≥95、LCP ≤2500ms、CLS ≤0.1、JS gzip ≤50 KiB 和首屏 ≤1 MiB。此证据不代表线上 CDN、真实访客网络或桌面原生性能。

## 首次失败与处理

- 先前浏览器测试中一个隐藏元素断言匹配两个节点，导致 strict locator 错误；修正为可见元素数量断言，后续完整测试通过。
- 前一轮自动审批因 usage limit 未完成 Chrome 重跑；本轮审批恢复后完成，未绕过审批。
- 本轮错误地并行执行根测试/构建，两者都准备 `public/file-engine/`，构建首次出现 `FoxitDingbats.pfb` ENOENT；等待测试结束后串行构建通过。保留第一结果和串行重跑日志在 `website/output/`，不修改引擎代码或弱化测试。以后按顺序运行这两个命令。
- 原临时 pnpm store 已被清理，默认 offline install 出现非 TTY purge 提示；用新的忽略 store 按锁文件联网重装，随后相同 store 离线安装和完整网站检查通过。
- 实际 Chrome CUA 第一次获取应用异常耗时，后续导航/缩放调用完成；不将接口等待时间当成网站加载性能。

## 收尾与未涵盖范围

最终 `openspec validate --all --strict` 为 28/28 通过（保留其他 icon 变更的既有 archive 提示），`git diff --check` 通过；另扫描 58 个新增文件，未发现尾随空白。apply 进度为 19/19；工作区仅包含 website、新网站工作流、维护文档、README 开发入口和本 change。未改桌面源码/根锁文件。完整截图、Lighthouse 原报告和构建日志保留在忽略的 `website/output/`。

本地预览：`http://127.0.0.1:4321/`。无公开安装包、Windows/Intel 原生设备验收和托管 CI 仍无新增通过证据。部署、DNS、推送、提交、公开发布、spec sync、归档均未执行。
