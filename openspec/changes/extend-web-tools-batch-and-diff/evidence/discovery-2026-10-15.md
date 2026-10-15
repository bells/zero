# 在线工具搜索与 Agent 说明增量

日期：2026-10-15（Asia/Shanghai）。用户确认实施前轮建议的三项：搜索 metadata、步骤及输入/输出示例、浏览器 Agent 使用说明。本轮不包含提交、推送、部署、搜索平台写入、spec sync 或归档。

## 实现

- 四工具的双语搜索标题独立于紧凑导航名称，目录描述明确列出 JSON、时间戳、Base64/URL 和文本/UTF-8 文件对比。
- `web-tool-guides.ts` 定义 typed 步骤、具名输入/输出示例和 Agent 输入/输出/动作；`web-tools.ts` 将其组合进同一注册表。静态 HTML 与 `llms-full.txt` 共用指南，WebApplication featureList 使用同一动作清单。既有 notes 继续作为格式和资源限制来源。
- 页面提供 `#usage`、`#steps`、`#examples`、`#agent-usage` 锚点，示例通过 pre/code 保留换行并安全转义。Agent 文案使用实际控件标签，说明 JavaScript、初始/按需资源网络需求、本地内容处理、状态/错误和过期结果边界；不将浏览器交互宣传为 HTTP API、MCP 或服务端计算。
- 导出注册表的纯组合标注允许构建器移除客户端不使用的静态内容。产物检查确认所有指南搜索标题均未进入可执行 JS；不靠增加脚本实现可抓取内容。索引 HTML 仍为 28 页，另有两个 noindex 错误页。

## 验证

| 检查 | 实际结果 |
| --- | --- |
| `pnpm --dir website check` | 81 files；0 errors / warnings / hints |
| `pnpm --dir website test` | 31/31，含双语示例对实际 JSON、时间、编码和 diff 计算逻辑的核对 |
| `pnpm --dir website build` | 30 HTML（28 正常页面、2 错误页）、AI 索引及 sitemap 构建通过 |
| `pnpm --dir website test:seo` | 9/9；同源指南、能力清单、AI 示例、脚本排除及原 metadata / sitemap / 错误页回归 |
| `pnpm --dir website verify:fixtures` | catalog、manual preview/base path、Vercel Preview、显式 SITE_PREVIEW=0 通过 |
| 浏览器 | 本轮覆盖 66 个独立用例；完整运行 58 通过、8 个旧说明区定位断言失败。修改为分别断言 usage 与 agent-usage 后，工具与发现 24 项复测有 23 通过、1 个旧 catalog 样例脚本引用失败；刷新 fixture 后，该项和双语发现共 3/3 通过。通过结果来自分批复测，不声称一次运行 66/66 |
| 新增发现流程 | 双语目录 → JSON 工具 → 按标签输入 → 格式化 → 读取预期结果；控制台无应用错误。四工具双语在 320px 且禁 JS 时均可读取步骤、完整示例和 Agent 说明，无整页横向溢出 |
| 原工具回归 | 浅深 axe AA、1440/768/720/390/320、复制/下载、worker 失败/超时/取消、隐私、子路径与语言切换均在已通过的用例内 |
| 人工视觉 | 审阅双语 JSON 示例视口截图，390px 代码和文字可换行，1440px 层级清楚；未把本机全页截图用于精确布局证明 |
| OpenSpec | `openspec validate --all --strict` 30/30；原 icon-system 归档信息提示未改变 |

Browser plugin not available：当前没有 browser skill，使用仓库已有 Playwright / Chrome。预览/Chrome 在沙箱内因 listen EPERM 失败时，保留结果并通过授权的沙箱外本地执行完成浏览器检查。性能使用独立本地预览 `http://127.0.0.1:4322/`，避免占用原 4321 端口。

新增断言先在旧产物失败（目录描述未列工具），实现后通过。新浏览器测试曾被 TypeScript 指出数组首项可能 undefined，改为校验所有示例的输入/输出数组；没有用非空断言或放松类型规则。

截图位于本机忽略的 `website/output/screenshots/discovery-{zh,en}-{desktop,mobile}.png`，最新机器报告在 `website/output/`；这些生成文件不加入源码提交。

`WEBSITE_ORIGIN=http://127.0.0.1:4322 WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website verify:performance` 通过。环境为 macOS arm64、Node 24.20.0、Chrome 155.0.8059.79、Lighthouse 13.5.0，390×844 移动端模拟：18 页 performance 98–100、accessibility 均 100、LCP 1354–1656ms、CLS 0–0.0912（≤0.1）。在线工具首屏可执行 JS gzip 6891–14103 bytes，保守资源正文总量 146146–167624 bytes，均通过 ≤50 KiB / ≤1 MiB 预算。指南静态内容未进入可执行 JS。

既有交互预算同时通过：1 MiB JSON 171ms、1,000 行批量 154ms、长行 diff 130ms、压力输入取消 28ms / 导航 141ms；这些是本机合成用例单次观测，不代表生产用户延迟或所有设备表现。原始报告在忽略的 `website/output/performance/summary.json`，capturedAt 为 2026-10-15T14:23:56.128Z。

以上均为本地实现与检查，不证明生产已更新、搜索引擎已重抓或 AI 已引用。用户确认 Google/Bing sitemap 已成功，未修改其账号设置。本次启动的 4322 性能预览在验收后关闭，未停止已有 4321 服务。
