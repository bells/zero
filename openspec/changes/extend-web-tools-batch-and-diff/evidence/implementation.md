# 官网批量时间戳与文本对比实施记录

日期：2026-10-15。范围为本地 `website/`、维护文档和本变更，工作分支 `codex/extend-web-tools-batch-and-diff`。没有提交、推送、部署、spec sync 或归档；没有修改发行清单、桌面 `src/` / `src-tauri/` 或旧变更 evidence。

## 实施

- 时间戳原 URL 新增单条/批量模式，保留时钟/严格输入语义；逐行结果保留原行号、原文、成功解释/表示或本地化失败。支持混合结果、100 行分页和完整 JSON 复制/下载、剪贴板拒绝回退、结果失效与导出资源释放。
- 新增双语 `/tools/diff/`，文本与本地 UTF-8 文件统一比较。默认精确比较（仅规范行分隔），保留终止换行，显示增删、行号、Unicode 码点行内高亮及其降级、差异导航、并排/统一视图、有界上下文/长行分段。
- 新能力延续本地/短期状态、双语/主题、worker 超时取消、资源上限、静态发现和真实桌面 CTA。注册表/SEO/AI 索引与验证已扩展为四工具、28 个索引 HTML（另两个 noindex 错误页）。
- 开源依赖 `diff@9.0.0`、BSD-3-Clause、官方维护/类型/worker 依据见 [dependency.md](dependency.md)。算法只在主动比较后进入独立 worker；基本输入无编辑器依赖。

## 验证进展

已记录：基线网站测试 14/14；增量第一轮网站测试 28/28；Astro check 78 文件 0 errors/warnings/hints；build 30 HTML（28 indexable + 2 errors）；SEO 7/7。生产预览 Chrome 完整第一轮 61/61，另补子路径/文件超时测试和输出逃逸膨胀边界测试。修复后网站测试 30/30、Astro check 79 文件零诊断、SEO 7/7；修复后完整生产预览 Chrome 最终复验 64/64 通过（含合成私有标记不落 localStorage/sessionStorage/IndexedDB、无内容 URL 请求及 pagehide 释放）。性能结果见下表。

针对性验证覆盖：批量混合成功/失败与 JSON 跨分页导出、负值/时区、浅深 axe、320/390/720/1440 布局、复制拒绝、5 秒任务超时/取消/清空；对比双语/浅深 axe、严格 UTF-8/BOM/二进制拒绝、长行完整恢复、差异跨段导航、晚到读取与内容安全展示。合成私有标记观测网络、URL、console、站点存储；批量还观测实际 worker 终止与 Blob URL 撤销。

独立审查发现：超长相同上下文行可能耗尽窗口字节预算，导致“下一处差异”指示更新但目标未挂载。现已修复：必要时优先挂载目标，原上下文保留“上一段结果”访问路径。新增域与浏览器回归覆盖初次显示、跳转、长目标及完整上下文恢复，独立复核通过。

性能首轮采样脚本在读取 worker 的 page Response.body 时遇到 Chrome 返回 `Response body is unavailable`，未获得完成结果。独立最小诊断确认同一个本地 worker URL 返回 200、10,919 bytes；已将后续用户触发算法体积采样调整为对观察到的同源资源 URL 显式重读。此补救只在测试脚本中，不改变产品行为，也不将无法取样的资源记为零。

## 环境与证据边界

本机 macOS/Chrome，`http://127.0.0.1:4321` 的生产静态 preview。当前环境未提供 Browser 插件/skill，按 frontend-testing-debugging 使用已有 Playwright/Chrome 工作流。首轮沙箱无法监听端口（EPERM），获准后运行真实本地预览及浏览器。使用系统 Chrome 期间出现工具链 `NO_COLOR`/`FORCE_COLOR` 环境提示，不是页面 console 错误；页面错误检查单独执行。

参考差异：借鉴用户截图的左右文本、各侧打开文件、显式比较流程，保留 Zero 字体/冷青色/主题；没有增加参考站广告、账号、云历史或二进制文档比较。输入以原生 textarea 加光标行列辅助，结果显示双来源完整行号。

网站 check/build/自动浏览器/本地 Lighthouse 不能证明生产托管、CDN/CSP、搜索收录、其他浏览器/操作系统、桌面原生或安装包行为。未检查 Search Console/Bing，未改 DNS 或线上资源。首次加载及按需资源仍需网络；本地处理不承诺绝对安全或 JS 内存安全擦除。

补充：超长上下文导航已由原实现者修复，独立复核判定 ADDRESSED；新增域测试覆盖初始目标、后续目标、目标本身长行及完整上下文恢复，Chrome 回归通过。最终整体代码审查未发现额外可操作缺陷；另做真实 Chrome 离页/返回检查，确认 BFCache 恢复时 page.ts 的 reload 保持控制器可用。

性能第二次运行在 Playwright `fill` 注入 20,000 行时超时，尚未进入 Lighthouse。最小探针观察：原生自动化 fill 在 5 秒内未返回，后续查询也超时；同页受控 DOM value + input 事件注入 1,000/5,000/20,000 行分别耗时约 2/4/27ms，随后真实键盘可编辑。压力脚本因此显式采用 DOM fixture 注入并记录方法，仍通过实际键盘、比较、取消和搜索观测交互；不将其表述为原生大段粘贴性能证明。

子路径补充 Chrome 2/2：两项新 worker 在 `/zero-preview/` 下计算、四工具搜索及语言路由；窄屏首次默认统一视图，文件读取达到 5 秒后保留源文并可重试。测试最初因预期文案 `5 seconds` 与真实 `5-second` 不一致失败，改为语义匹配后通过，产品逻辑未改。

## 最终性能结果

完整命令 `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website verify:performance` 退出码 0；2026-10-15 21:33（Asia/Shanghai），Node v24.20.0、Chrome 155.0.8059.79、本机 macOS arm64。协议与逐页数据见 [performance-summary.json](performance-summary.json)。

| 项目 | 实测 | 预算/解释 |
| --- | --- | --- |
| 代表页面 | 18 | 包含双语在线目录/四工具及既有产品/文档页 |
| Lighthouse performance | 98–100 | ≥95 |
| Lighthouse accessibility | 全部 100 | ≥95 |
| 最大 LCP | 1,729ms | ≤2,500ms |
| 最大 CLS | 0.0912 | ≤0.1 |
| 最大初始脚本 gzip | 14,103 bytes | ≤51,200 bytes，统计实际自动加载脚本 |
| 最大首屏资源 | 165,108 bytes | ≤1,048,576 bytes，未压缩正文保守累加 |
| 1,000 行批量结果可用 | 143ms | 本机样例，100 行挂载分页 |
| 10,000 字符长行对比 | 122ms | 显式行内降级仍保留整行 |
| 按需比较 worker gzip | 4,047 bytes | 主动比较后的资源，原页面请求不自动加载 |
| 每侧20,000行下编辑/取消/搜索 | 202 / 40 / 140ms | 受控 DOM fixture 后真实交互；非原生大段粘贴性能证明 |

主路径已用 Chrome 检查 URL/title、非空 H1、无 framework overlay/页面错误、真实比较结果、截图及手机横向溢出；对比工作区截图位于 `/tmp/zero-diff-zh-workspace.png`，手机位于 `/tmp/zero-diff-zh-mobile.png`，均为合成示例，未作为源码资产提交。批量截图与新浏览器样例保留在本机测试输出。

## 最终验收与交付状态

| 门禁 | 实际结果 |
| --- | --- |
| `pnpm --dir website check` | 79 文件，0 errors / warnings / hints |
| `pnpm --dir website test` | 30 passed / 0 failed |
| `pnpm --dir website build` | 成功；28 索引 HTML + 2 错误 HTML |
| `pnpm --dir website test:seo` | 7 passed / 0 failed |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website test:browser` | 最终64 passed / 0 failed，隔离 catalog/base/noindex fixture 同时通过 |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website verify:performance` | 退出0，18页预算与 Lighthouse 均通过 |
| `openspec validate --all --strict` | 30 passed / 0 failed；既有图标规范未来归档依赖 INFO 与本变更无关 |
| `git diff --check` + 新增文本逐文件 no-index check | 通过；未修改根桌面源码/发行清单/旧变更证据 |

批量及差异独立审查、差异修复复核和最终整体审查均完成；[最终审查记录](review.md)保留核验范围，后续补充检查不替代其静态审查。25 项实施任务按实际证据勾选。本地功能分支保留未提交代码，没有进行合并、提交、推送、部署、发行、spec sync 或归档。
