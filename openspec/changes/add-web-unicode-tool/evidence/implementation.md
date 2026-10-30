# Unicode 在线工具实施记录

日期：2026-10-30。工作分支：codex/add-web-unicode-tool；按维护者选择在当前目录实施。变更尚未提交、推送、部署或归档。

## 实现与范围

- 独立纯 TS Unicode 扫描器处理两种转义形式、严格代理项、原始反斜杠奇偶及单层语义；默认编码非 ASCII，反斜杠/ASCII 控制字符始终编码，可选全部 ASCII。
- 扩展现有类型化 Worker 契约与分派，复用 JobRunner，不新增依赖或运行器。界面独立初始化，复用默认行号、双语状态、复制失败回退、响应式布局和主题。
- 输入/选项/任务修订使旧工作及结果失效；5 秒截止、取消、失败与离页终止 Worker。TXT 与剪贴板使用独立保留的完整结果，避免输出框的 CRLF 规范化改变导出。
- 双语目录新增 development/unicode，源码九工具、十个反馈线程；38 个公开页面和两个错误页。新页补齐静态指南、SEO/AI、预览子路径和 noindex 覆盖。
- 内容仅在当前页面内存，不增加文件导入/历史；反馈保持默认关闭，登记双语共享 tools/unicode 线程及主题标签。

## 已执行检查

| 检查 | 当前结果 |
| --- | --- |
| 网站基线 pnpm --dir website test | 96/96 |
| Unicode 领域 RED→GREEN | 首次 6 项因缺少 Unicode 分派而断言失败；实施后通过。目录/指南/反馈身份新增第 7 项先因缺少目录条目失败，再通过 |
| pnpm --dir website check | 0 errors / warnings / hints；首次检查发现测试辅助 Window 类型声明问题，修正后通过 |
| pnpm --dir website test | 103/103，含新增 7 项 Unicode 领域检查及既有 JSON/Base64/URL |
| pnpm --dir website build | 40 个 HTML（38 公开 + 2 错误页） |
| pnpm --dir website test:seo | 10/10 |
| pnpm --dir website verify:fixtures | 隔离安装包、预览子路径、noindex、反馈两来源 fixture 构建通过 |
| 网站 Chrome 完整浏览器回归 | 初次稳定构建重跑 142/142；目录布局修复后最终完整回归 143/143，包括新增初始化前后布局检查，以及双语转换、ASCII、错误行列、完整 TXT 字节/无 BOM、默认行号、复制失败、迟到 Worker、取消/超时/失败恢复、URL 清理、历史恢复、主题/320px/缩放/axe、子路径 |
| 公开链接检查 | 0 个公开安装包资产、5 个项目链接通过（使用维护者提供的代理），不是发行验收 |
| pnpm --dir feedback check/test/build/verify:client | 类型检查、12/12 测试、构建通过；客户端 7,944 gzip 字节，未引入服务端配置或内容存储 API |
| 反馈两来源 Chrome 完整浏览器回归 | 14/14；覆盖双语 Unicode 共用线程、激活前无反馈连接、只传稳定上下文及服务失败不阻断转换/导出 |
| 最终 verify:performance | 28 路由全部通过；性能 99–100、可访问性均 100、最大 LCP 1,733 ms、最大 CLS 0.052504；所有 JS/首屏资源预算通过 |
| 最终规范与文档检查 | openspec validate --all --strict：38/38；139 个本地 Markdown 目标有效；git diff --check 通过 |

首轮浏览器结果 139/142：两处搜索断言沿用旧数量/过宽查询，修正为九工具及准确查询；另一次 Markdown 初次加载碰上静态构建替换，后续严格串行的稳定构建重跑通过。最初沙箱运行无法监听 127.0.0.1；获准的本地运行方式完成验证，没有修改应用权限或放宽安全配置。

## 独立审查

只读 reviewer 独立通过 7 项领域检查、1,000 组随机文本在两种 ASCII 选项下的往返检查及 99 种连续反斜杠长度检查。

发现一项 Important：服务端和访客页已登记新线程，但网站点击加载代码仍缺少 tools/unicode 白名单，导致配置启用时入口隐藏。实际两来源测试先复现双语入口不可见（2 项失败），补齐网站白名单并重建 fixture 后，完整反馈浏览器回归 14/14 通过。保留首轮失败和最终通过日志，未改变默认关闭或点击加载策略。

审查中考虑后的判定：

- textarea 的 CRLF 显示规范化：保留原始 resultText 供导出，不回读输出框，符合完整导出需求。
- 8 MiB 输出上限：当前 1 MiB 输入最大编码膨胀约 6 MiB，仍保留增量字节预算，不能通过可见 UI 构造超 8 MiB 的合法单次结果。
- 已交给 Clipboard API 的写入无法取消：revision 阻止迟到状态和手动复制回退恢复，沿用浏览器 API 能力边界。
- 首次离线、原生 Safari/iPhone 和部署：没有用自动化冒充此类证据；不在源码完成时声明验收。

## 目录布局偏移的性能回归

首次完整性能检查的 28 路由性能为 97–100、可访问性均为 100，所有初始 JS/首屏字节预算通过，但中文目录 `/tools/` CLS 为 0.101472，超过 0.1 门槛，因此该命令退出 1，不能记为通过。Unicode 双语页均为 99/100、CLS 0。

Lighthouse 指向 `.wt-directory`；阻塞页面 JS、分别测量初始化前后位置的回归测试复现向下偏移 119.5 px。原因是目录分类/搜索控件由 hidden 切换显示时没有预留空间。在目录 header 内为这些控件保留布局、使用 visibility 隐藏以继续阻止聚焦和辅助技术访问；规则与全局重要 hidden 规则位于同一 reset layer，避免 CSS layer 优先级使修复失效。双语针对性回归和最终整站 143/143 通过，最终性能复测中文目录为 100/100、CLS 0。工具详情页不应用该例外。

原始失败证据保留在 `/tmp/zero-unicode-performance-initial.json`、`/tmp/zero-unicode-directory-cls-initial.json` 和 `/tmp/zero-unicode-layout-red.log`。

## 接近上限的本地资源实验

环境：macOS、本地生产预览、Node v24.20.0、pnpm 10.33.0、Chrome 156.0.8078.73。合成输入通过 DOM value 与 input 事件填入，随后点击真实方向按钮；耗时包含 Worker 与结果界面更新，不代表人工粘贴速度。

- 中文输入 1,048,575 UTF-8 字节，编码得到 2,097,150 字节，203.20 ms。
- ASCII 输入 1,048,576 字节，勾选全 ASCII 后编码得到 6,291,456 字节，454.41 ms。
- CDP 强制 GC 后的 JS heap：输入前 2,148,916 字节，最大结果保留时 8,529,024 字节，清空后 2,246,428 字节；离页后 Worker 为 0。
- 控制台/页面错误、合成内容请求泄漏均为空。上述为单机 JS heap 观察，不是物理内存或手机设备保证；取消、5 秒截止、Worker 故障和迟到结果另由可控浏览器测试覆盖。

实验脚本与原始数据：`/tmp/zero-unicode-probe.mjs`、`/tmp/zero-unicode-probe.json`。临时文件不属于提交产物。

## 最终资源预算与交付边界

最终性能数据采集于 2026-10-30 02:28:48 UTC，本地生产预览和 Lighthouse mobile simulated throttling；28 路由完整命令退出 0。Unicode 双语页性能/可访问性均为 99/100，初始 JS gzip 均为 12,040 字节，首屏未压缩资源中文 176,396 字节、英文 177,161 字节；LCP 分别约 1,654/1,657 ms，CLS 分别为 0/0.052504。报告保存在忽略的 `website/output/performance/summary.json`，完整日志为 `/tmp/zero-unicode-performance-final.log`。

OpenSpec 任务完成 21/23。原生桌面 Safari 和真实 iPhone Safari 验收尚未完成，任务 4.4/4.5 保持未勾选；Chrome 的移动视口和 WebKit 自动化都不能替代实机。当前工具会话无法继续调用原生 computer-use，不能据此宣布 Safari 实机通过。代码尚未提交、推送、部署、同步规范或归档。
