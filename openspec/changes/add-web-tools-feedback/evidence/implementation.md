# 本地实现与验证（2026-10-17）

本次执行 `/opsx:apply add-web-tools-feedback`；许可调查首次暂停后，用户选择先核清 Waline 许可再继续。按明确 GPL v2 授权保守采用独立服务，未声称上游解决 MIT 元数据冲突。固定包、官方标签及文件摘要见 [candidate-release.json](candidate-release.json) 和[许可核查](license-clarification-2026-10-17.md)。首次评估记录保留历史语义，由本记录更新技术门禁状态。

## 实现边界

- 独立 `feedback/`、锁文件与 GPL-2.0-only 源码；只导入固定发布包内的 Waline core，不启动默认 ThinkJS 服务，没有改写上游文件。受控初始化创建管理员，HTTP 不提供注册/抢注路径；自有最小后台复用 core 的认证、审核、回复和导出。
- Hono facade 服务端校验线程/未知字段、Unicode 字符、邮箱、16 KiB 流式请求体；匿名记录强制待审。公开列表/回复/计数/ID 均白名单，20 条分页，仅 approved 可见；父项隐藏或删除后回复不可读。站长身份来自认证数据库角色，昵称不能授予身份。
- PostgreSQL 共享 guard 事务锁协调滑动五次/十分钟限流、全局 UTC 日访客写入预算、暂停、24 小时幂等。Vercel 只接受平台来源头，本地只取 socket；错误无正文/邮箱/堆栈/SQL，未接入邮件、头像或外部反垃圾。来源有效期和物理保留的区别见下文未完成项。
- 官网共享入口仅覆盖在线目录与四工具的十个中英页面；线程跨语言/base 稳定，旧桌面说明保持原路径。未点击无 iframe/预连接/反馈请求；点击后仅独立来源，no-referrer、sandbox、frame-src/frame-ancestors、严格消息 origin/source/schema/高度。关闭恢复焦点并保留工具状态。
- 访客仅纯文字、可选昵称/邮箱，中英/浅深/system，明确待审、限流、失败/未知结果和显式重试；无持久草稿。请求期间新输入的草稿不会被旧成功响应清除。管理员 token 仅内存，单独顶层登录，不依赖第三方 Cookie。

## 可复现检查

环境：macOS、Node v24.20.0、pnpm 10.33.0、本机 Chrome。所有测试使用合成数据，不连接真实 PostgreSQL/Neon；本地 SQL 来自 PGlite。

| 检查 | 结果 |
| --- | --- |
| 固定发布包 `probe-release.mjs` | 8 项 characterization 通过；证明候选默认行为/差异，不是生产 facade 验收 |
| `pnpm --dir feedback check` | TypeScript 通过；无新 TypeScript `any` |
| `pnpm --dir feedback test` | 12/12；真实本地 SQL + Hono Request/Response，非远程 HTTP 或 Neon 多实例验收 |
| `pnpm --dir feedback build` | 类型检查与 Vite 客户端构建通过；不是 Vercel 函数打包/部署证明 |
| `pnpm --dir feedback verify:client` | 4 个 JS/CSS 资产合计 gzip 7,769 bytes；不含服务端配置名称/秘密 canary 或浏览器持久存储 API；另用合成 JWT/salt/数据库环境值重建并审计通过，未连接该数据库 |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir feedback test:browser` | 9/9；两个真实 HTTP 来源 4321/4323，28.1 秒 |
| `pnpm --dir website check` | 85 文件，0 errors / warnings / hints |
| `pnpm --dir website test` | 33/33，含规范化 origin、线程/消息负向测试 |
| `pnpm --dir website build` | 30 HTML 页面，28 个可索引页面；反馈关闭，不新增索引页 |
| `pnpm --dir website test:seo` | 9/9，旧双语/AI/sitemap/404 约束保持 |
| `pnpm --dir website verify:links` | 0 个公开发行包、5 个项目链接通过；通过本机代理访问公开地址 |
| `WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir website test:browser` | 66/66，1.3 分钟；先串行构建隔离发行、preview/base 和反馈启用 fixture |
| `pnpm --dir website verify:performance` | 18 路由全部通过；mobile performance 97–100 / accessibility 100，最大 LCP 1656.82ms / CLS 0.09120；初始 JS 最大 15043 gzip bytes，首屏最大 171253 bytes |
| OpenSpec / whitespace | `openspec validate --all --strict`：31/31；`git diff --check` 与 51 个新文件的 `git diff --no-index --check` 无诊断 |

反馈 suite 的真实传输覆盖：匿名空资料提交→待审不可见→管理员登录/批准→公开纯文字→站长回复；208 个底层路径/方法组合实际 HTTP 均 404。主站到服务的 URL/body/referrer/message 不包含工具输入/结果、搜索或 UTF-8 文件名/内容合成标记；跨站存储被阻止时可提交，同源策略禁止访问父 DOM/顶层导航。直接服务测试另覆盖状态/线程夹具、25 条顶层及 25 条回复的分页/计数/ID/公开字段、Origin、匿名权限、跨线程/嵌套回复、隐藏/删除、幂等冲突、滑动限流/预算/暂停和导出恢复。

故障范围明确区分：实际服务持久化后，由 Playwright 延迟丢弃响应，8 秒显示“结果未知”；无自动第二次请求，手动重试同键/正文获得同一收据。429 UI 使用故障注入；真实服务 429 另由 SQL 服务测试覆盖。iframe 中断由浏览器阻断请求，12 秒就绪超时后可重试/关闭，JSON 工具状态不变。320px 深色、200% 字体放大、reduced-motion、焦点/Enter 和 axe 检查通过；这是 Chrome 自动化，不是 Safari 或物理手机验收。成功的中文 diff+iframe 截图在忽略的 `feedback/output/browser/embed-diff-feedback-zh.png`，已人工查看布局。

客户端 7,769 bytes 是管理员和访客全部 JS/CSS 总和；访客只加载自己的入口和共享资产，另有 HTML/API。它不是网络冷启动、完整响应大小或服务内存测量。真实托管延迟、函数/导出内存与供应商限制仍需验收。

## 独立审查与修正

独立只读安全审查发现并修复三项问题：预览 origin 字符串差异可能绕过生产隔离、管理员密码猜测未限流、Waline 拒绝重复正文回滚了来源计数。现按规范化 origin 比较；登录在哈希校验前共享限流；来源计数在 SAVEPOINT 外提交，核心失败仅回滚记录创建。补充回归后，审查者独立重跑当时 11/11 服务测试并确认三项修复，无重要未修复问题。之后新增公开分页覆盖（最终 12/12）与超时真实持久化浏览器覆盖（最终 9/9），未改服务行为。

## 数据恢复、维护与未完成项

合成导出/隔离恢复保留六条混合待审/已批准/拒绝/隐藏记录、线程、父子关系及私密邮箱；重新映射站长 ID 和评论 ID，目标管理员凭据保留；拒绝再次向非空目标恢复。未授权导出失败，公开恢复后仍不包含邮箱/哈希/IP/UA。私密导出不写仓库；本次没有真实备份。初始化、审核、升级、巡检、暂停、删除、保留与恢复入口见 [feedback/README.md](../../../../feedback/README.md)、[官网指南](../../../../docs/website.md)。

**3.4 保持未完成**：来源摘要十分钟、幂等 HMAC 24 小时为逻辑有效期；请求时清理和 CLI 已实现，但服务空闲时没有托管周期任务，不能保证物理记录至多保留 24 小时。需要获准配置并验证定时清理和失败告警后，才可闭合该项。反馈/邮箱本身没有自动删除，供应商日志/备份期限未知；文档不承诺自动到期。

**7.1–7.4 保持未完成**：没有创建/修改 Vercel/Neon 资源、使用真实凭据、绑定域名、部署或启用生产。实际套餐/用途/免费资格、超额与费用、TLS/区域/日志/备份、平台来源头、函数打包/响应/导出上限、跨实例并发、托管 iframe/CSP、Safari 以及回滚演练都尚未验证。`FEEDBACK_QUALIFIED` 默认不通过，托管写入暂停，官网默认禁用；不能仅设置开关代替资格验收。

本次没有更改桌面依赖/源码、运行 Rust/native/Windows 流程或生成安装包；这些不属于纯官网/独立服务的替代检查。没有 commit、push、publish、spec sync 或归档。

最终本地任务状态为 **23/28**；3.4 及 7.1–7.4 保持未完成。性能测量使用 Chrome 155.0.8059.80、Lighthouse 13.5.0，18 页均为未启用反馈的本地生产静态预览；测量/截图/构建仅进入忽略输出。上游 LICENSE 保留原始字节（含缺少结尾换行），不为格式化改写其已核验摘要。
