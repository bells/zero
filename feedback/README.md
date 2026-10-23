# Zero 独立反馈服务

`feedback/` 是独立 Node 24 工程，不进入桌面或官网浏览器 bundle。官网只在主动点击后创建异源 iframe。当前完成本地合成数据接入，生产入口默认关闭；Vercel/Neon 账号资格、费用、区域、日志/备份保留、定时清理和托管部署仍未验收。

## 架构与许可

- `shared/contracts.ts` 定义九个线程（工具目录 + 八个在线工具）、输入限制和公开 DTO；中英页面共享线程，正文不自动翻译。新增工具时同步核对官网和服务白名单。
- `server/app.ts` 是唯一 HTTP facade。访客只能创建待审顶层记录；所有公开读取使用已批准状态和字段白名单。管理员使用独立 `/admin` 页面，服务端核验会话与角色后才能审核、回复、编辑、删除、查看邮箱或导出。
- `server/waline.ts` 通过小型 PostgreSQL 模型适配器复用固定 `@waline/vercel@1.43.4` 内置的 `@waline/core@0.1.0`。后者没有独立 npm 发布，不能替换成不存在的独立依赖。没有启动默认 ThinkJS HTTP 入口；注册、原生评论、OAuth、RSS 等底层路由均不挂载。没有修改 upstream 文件或维护大型 fork。
- JWT 使用 HS256、30 分钟会话及数据库权威管理员角色；浏览器仅在内存保存 token。访客没有账号、Cookie、持久资料或草稿。正文以 `textContent` 展示，不调用 Markdown、头像、邮件、分析或反垃圾服务。
- PostgreSQL 共享事务锁协调不同函数实例的限流、预算和幂等；本地 PGlite 仅用于合成数据，不能作为 Neon 多实例验收。

Waline npm/package.json 的 MIT 元数据与该发布包及官方标签内的 GPL v2 LICENSE 冲突。此工程保守按 **GPL-2.0-only** 使用明确许可，保留 [LICENSE](LICENSE) 和 [第三方说明](THIRD_PARTY_NOTICES.md)，没有声称 upstream 已澄清冲突。新适配器/服务源码采用同一许可，网站/桌面许可不因此改写。分发此服务时提供对应完整源码、锁文件、构建说明、改动和上游声明。核查来源与摘要见[许可记录](../openspec/changes/add-web-tools-feedback/evidence/license-clarification-2026-10-17.md)。

## 本地运行与检查

在仓库根目录执行；依赖和锁文件均与官网分开：

```bash
pnpm --dir feedback install --frozen-lockfile
pnpm --dir feedback check
pnpm --dir feedback test
pnpm --dir feedback build
pnpm --dir feedback verify:client
```

临时演示只使用进程内合成数据库，退出即丢弃：

```bash
FEEDBACK_ENV=local FEEDBACK_DEMO=1 FEEDBACK_WRITES_PAUSED=0 pnpm --dir feedback start
```

访客地址：`http://127.0.0.1:4323/?threadId=tools/json&locale=zh`；管理地址：`http://127.0.0.1:4323/admin`。仅此本地演示的合成账号为 `owner@example.invalid` / `synthetic-demo-password`，不能用于托管环境。

嵌入回归使用真实的两个本地 HTTP 服务，主站来自独立的启用预览 fixture：

```bash
pnpm --dir website verify:fixtures
WEBSITE_BROWSER_CHANNEL=chrome pnpm --dir feedback test:browser
```

先结束其他占用 4321/4323 的服务。fixture 准备和网站完整浏览器测试须串行运行。浏览器输出、截图、性能预算在忽略的 `output/`；不是生产部署证明。`verify:client` 检查构建资产不含服务端配置或存储 API，并记录点击后独立资源 gzip；初始主站预算另由官网检查负责。

## 环境和受控初始化

`.env.example` 只是模板，不会被 `pnpm start` 自动加载。真实本地配置使用忽略的 `.env.local`，不把凭据写入命令、截图、仓库或构建参数。用 Node `--env-file=.env.local` 显式读取，或由受控运行环境注入。

| 变量                                               | 用途                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `FEEDBACK_ENV`                                     | `local`、`preview` 或 `production`；Vercel 环境须显式匹配                     |
| `FEEDBACK_ORIGIN`                                  | 反馈服务自己的完整 origin，托管仅 HTTPS、无路径                               |
| `FEEDBACK_PARENT_ORIGINS`                          | 可嵌入的主站 origin，逗号分隔；不能包含反馈服务同源地址                       |
| `DATABASE_URL`                                     | 对应环境的独立 PostgreSQL 库；服务端使用证书校验 TLS、连接/查询超时与小连接池 |
| `FEEDBACK_JWT_SECRET` / `FEEDBACK_SOURCE_SALT`     | 两个独立随机秘密，各至少 32 字符；只在服务端保存                              |
| `FEEDBACK_DAILY_WRITE_BUDGET`                      | 每 UTC 日访客新记录上限，托管默认 0，最大 10000                               |
| `FEEDBACK_WRITES_PAUSED`                           | `1` 暂停新访客提交；审核、读取和导出仍可用                                    |
| `FEEDBACK_QUALIFIED`                               | 托管默认未合格；仅完成全部启用门禁后设 `1`，不是资格证明本身                  |
| `FEEDBACK_LOCAL_DATA`                              | 本地 PGlite 可选持久目录，如 `.data/demo`；默认内存，不使用真实数据           |
| `FEEDBACK_ALLOW_LOCAL_POSTGRES`                    | 本地显式设 `1` 才允许连接 `DATABASE_URL`，避免误用已有生产配置                |
| `FEEDBACK_ADMIN_EMAIL` / `FEEDBACK_ADMIN_PASSWORD` | 仅初始化 CLI 使用，密码至少 16 字符；初始化后从运行配置移除                   |

预览必须使用独立 origin、数据库、管理员与两个秘密，禁止复用生产库。管理员初始化在受控 CLI 运行，创建表及第一个管理员；已有用户时拒绝再次初始化，HTTP 不提供抢注入口：

```bash
pnpm --dir feedback exec node --env-file=.env.local --experimental-strip-types scripts/init-admin.ts
```

本地需持久化时，初始化和启动使用同一个 `.env.local`、数据目录和秘密。会话过期需重新登录；登出只清除当前内存 token，轮换 JWT secret 会使现有会话失效。当前未交付管理员 2FA 配置流程；不要把代码中的可选验证码字段描述成已启用 2FA。

## 审核与日常维护

在反馈 origin 的 `/admin` 登录，按页检查待审正文和私密联系信息。可批准、拒绝、隐藏、编辑或删除；仅管理员可对同线程已批准顶层记录发布一层回复。隐藏/删除父项后，公开接口不再提供子回复；删除记录同时删除该记录邮箱。需删除整个讨论时一并处理回复，不能把隐藏当作物理删除。访客昵称不决定站长身份，公开身份来自服务端角色。

每天检查服务可用性、待审量、数据库行数/存储、函数调用/持续时间、出口流量和账号费用面板；根据实际额度设置保守预算。预算仅限制访客成功创建记录，不限制所有请求或管理员写入，不能替代平台配额、告警和费用保护。登录有独立来源限流与每日次数上限；公开读取没有费用硬上限。发现异常先暂停写入，必要时关闭主站入口。

有效访客提交每来源最多五次/十分钟，拒绝的核心重复提交也消耗准入次数；同幂等键/正文的已保存重试只返回原收据，24 小时后不再保证跨窗口重试去重。来源使用盐化 HMAC，应用不保存原始 IP/UA。Vercel 仅信任平台注入的 `x-vercel-forwarded-for`，非 Vercel 请求不使用此头；本地取 socket 地址。平台覆盖该头的实际行为仍须托管实测。Origin 检查防浏览器跨源写入，不能阻止能伪造 Origin 的直接 HTTP 调用，后者依赖服务端限制。

### 保留、清理和删除

应用当前**没有自动删除反馈或联系邮箱的期限**；由管理员按用途审核、删除，并记录实际策略。服务不主动发送邮件，不能承诺自动通知或答复时间。云商可能保存连接元数据，不承诺网络匿名。

控制表中来源摘要逻辑有效期为十分钟，幂等键/正文 HMAC 为 24 小时；写入/登录时清理过期记录，也提供 CLI：

```bash
pnpm --dir feedback exec node --env-file=.env.local --experimental-strip-types scripts/purge.ts
```

**尚无托管周期任务，空闲时记录仍可能物理留存超过 24 小时。** 必须在获准的云资源中配置并验证足够频繁、带失败告警的周期清理，再满足任务 3.4 的硬期限；仅在请求时清理不够。服务仍保持未合格/写入暂停。数据库备份和服务商日志可能保留已删数据，启用前必须记录实际地域、周期、可删除性和到期行为。清理 CLI 不删除云商日志或备份。

### 私密导出、恢复与删除请求

管理页 `Export private JSON` 先请求认证接口，再显式下载；文件含反馈、邮箱、审核状态和管理员凭据摘要等私密字段。只保存到受控私有目录，按实际备份策略加密/限权，不能放入源码、静态站、公开工单或日志。恢复只导入评论数据并映射到目标管理员，不覆盖其凭据。

先在独立非生产空库初始化管理员，再使用绝对私有备份路径：

```bash
FEEDBACK_RESTORE_ISOLATED=1 pnpm --dir feedback exec node --env-file=.env.local --experimental-strip-types scripts/restore.ts /absolute/private/zero-feedback-private.json
```

目标配置必须是隔离库；脚本拒绝 production、未声明隔离、非空评论库、超过 32 MiB 的文件或非法关系。恢复后核对线程、待审/拒绝不可见、已批准可见、站长回复和邮箱仅管理可读。大于此上限的导出需重新评估受控迁移，不能直接放宽线上函数限制。

收到删除请求时先核对记录，删除正文和邮箱，按选定策略删除私密导出副本，并记录云商备份/日志的实际失效期限；不要承诺已从所有备份即时擦除。导出 API 当前没有流式大数据支持，托管函数响应大小/内存上限仍是启用门禁。

## 升级、部署与回滚边界

升级先核对固定发布包、LICENSE/声明、Node 与托管兼容性及 bundled-core 路径；更新独立锁文件，重跑类型、服务、构建、客户端审计和两来源浏览器负向矩阵，再在隔离托管预览检查。不得只参考 upstream main 文档，或为升级重新开放原生 HTTP 路由。需要分发时一并更新许可说明与对应源码。

`vercel.json` 仅是候选 Node 函数/静态资源路由配置，Root Directory 应为 `feedback`；没有执行 Vercel 打包、Neon 连接或真实部署验收。启用前须另行获准创建/配置资源，确认用途资格、零新增费用、未绑卡/超额行为、预算、区域和保留策略；验证函数打包、TLS、平台来源头、响应/导出上限、CSP、周期清理、跨实例并发、Chrome/Safari iframe，再配置官网。官网映射和启用方式见[官网维护指南](../docs/website.md)。

回滚可先将 `FEEDBACK_WRITES_PAUSED=1` 重新部署服务，再将官网 `PUBLIC_FEEDBACK_ENABLED=0` 重建发布；若仅关闭官网入口，直接调用仍可能写入，因此异常流量时也需服务暂停。两步均不删除数据库。实际部署和回滚演练留在 OpenSpec 7.x，不由本地构建替代。
