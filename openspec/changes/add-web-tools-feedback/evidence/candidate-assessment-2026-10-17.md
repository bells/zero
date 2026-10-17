# Waline 固定发布候选评估（2026-10-17）

> 后续核查：[许可采用决策](license-clarification-2026-10-17.md) 已选择按 GPL v2 保守采用，恢复技术门禁；下述首次暂停记录保留历史语义。

结论：已完成 1.1 的固定版本调查和最小本地复现，但候选尚未批准。`@waline/vercel@1.43.4` 的 npm 元数据与 `package.json` 声明 MIT，实际发布包 `LICENSE` 是 GPL v2；所附 `@waline/core@0.1.0` 也有同样差异。官方发布标签对应提交的根 LICENSE 与 tarball 文件 SHA-256 完全一致。许可依据尚不一致，依照 design 第 1 节的候选门禁，暂停引入生产依赖，待明确许可依据或重新选型。这里不认定 GPL 本身不可用，也不将元数据 MIT 当作已消除差异。

官网入口仍未接入；未创建 `feedback/` 生产工程、云资源、数据库、秘密、部署或提交。原有未跟踪规划文件保留。没有修改网站、桌面依赖或运行逻辑。

## 发布来源与完整性

- [npm registry 固定版本](https://registry.npmjs.org/@waline%2Fvercel/1.43.4)，2026-09-29 发布，调查时 `latest=1.43.4`。
- [发布 tarball](https://registry.npmjs.org/@waline/vercel/-/vercel-1.43.4.tgz)，实际下载并验证 SHA-512 与 registry integrity 一致；机器可读快照见 [candidate-release.json](candidate-release.json)。
- [官方标签](https://github.com/walinejs/waline/tree/%40waline/vercel%401.43.4)，GitHub tags API 解析到 `c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5`。
- [该提交的 package.json](https://github.com/walinejs/waline/blob/c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5/packages/server/package.json) 声明 MIT；[该提交的 LICENSE](https://github.com/walinejs/waline/blob/c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5/LICENSE) 为 GPL v2。
- LICENSE SHA-256：`010728bac3f86aa3c028f766a28f4ec2da4289335571dc9756e5a7d595de59bc`，发布包和官方提交文件相同。

仅有“最近有发布”这一维护信号，不据此保证长期维护、安全性或许可结论。需要先核清适用许可证和相应履行方式；不能自行删除 LICENSE、改写上游许可或只保留 MIT 元数据。

## Node / Vercel / Neon 与扩展点

| 项目 | 已核对的发布版证据 | 限制 |
| --- | --- | --- |
| Node | engines 为 `^20.19.0 \|\| ^22.12.0 \|\| ^24.0.0`；Node 24.20.0 执行所附 core 复现通过 | 不是完整 server 构建或托管测试 |
| Vercel | `index.js` 返回 Node req/res handler，使用 ThinkJS 4.0.0；包名和实现包含 Vercel 入口 | 未验证真实 Functions、冷启动、区域、额度或套餐资格 |
| PostgreSQL | 发布包包含 `src/service/storage/postgresql.js`、`think-model-postgresql` 依赖及 PG/POSTGRES 环境变量 | 未连接 Neon；数据库迁移、TLS、事务与跨实例限流均未验证 |
| 存储适配 | `src/extend/controller.js#getModel` 支持 custom model；入口将 `model` 映射到 `customModel` | 复现使用内存模型，不是持久化存储验收 |
| 扩展 | 插件 middleware、preSave/preUpdate/preDelete 等 hooks；bundled core 支持注入 models/services | 不能只靠 preSave 解决注册、所有公开查询和外部请求 |

调查安装在 `/tmp/zero-waline-probe/runtime`，`npm install --ignore-scripts --no-audit --no-fund @waline/vercel@1.43.4` 成功。禁用安装脚本，因此不证明 SQLite/native addon 可运行。安装伴有若干旧传递依赖弃用警告，未运行依赖漏洞审计；安装成功不等于依赖安全验收。生产工程的最小依赖和独立 lockfile 尚未建立。

## 最小本地复现

[probe-release.mjs](probe-release.mjs) 在下载的真实发布版 bundled core 上执行，使用显式的合成内存存储；不替换 core 行为，不连接外部服务或真实用户数据。共 8 项表征检查通过，它们既验证可行行为，也验证阻塞/需要适配的行为，不能称作“反馈验收 8/8 通过”。

| 观察 | 结果 |
| --- | --- |
| 固定版本/发布包 hash/许可差异 | 可稳定复现 |
| 无昵称和邮箱提交 | core 接受；存储 status=waiting |
| HTML/Markdown/Unicode 原文 | core 存储保留原文；未接 Markdown service 的 core 返回纯文本。这不覆盖完整 HTTP server 的 Markdown 渲染 |
| 待审读取 | core list/count 不返回 waiting 记录 |
| 管理员权限 | 匿名更新审核状态及导出返回 WalineError 401；合成管理员可审核、回复和导出含联系资料的备份 |
| 原生访客回复 | 原生 core 接受任意 pid/rid，必须在 facade 前拦截 |
| 原生公共 DTO | disableUserAgent=true 仍可返回存储 ua/任意额外字段，必须显式白名单裁剪 |
| 首用户注册 | 原生 core 为首次匿名注册赋予 administrator，必须在公共启用前初始化并关闭注册 |
| OAuth 与 Markdown（发布源码检查） | `fetch-oauth-service` 先于插件 middleware 执行，默认外部 OAuth discovery；Markdown 最终强制 html=true。需单独消除主动请求并确保访客只读纯文本 |

首轮复现 7/8：测试把单线程 count 误认为 number。查阅发布版发现非 deprecated 返回 `[count]`，修正表征断言后复测 8/8。没有改动上游实现。

### 复现命令

在仓库根目录执行；下载和依赖均留在临时目录。需要外网时可按本地代理设置 curl 的 `--proxy http://127.0.0.1:1087`。

```sh
mkdir -p /tmp/zero-waline-probe
curl --fail --location https://registry.npmjs.org/@waline/vercel/-/vercel-1.43.4.tgz -o /tmp/zero-waline-probe/waline.tgz
tar -xzf /tmp/zero-waline-probe/waline.tgz -C /tmp/zero-waline-probe
node --test openspec/changes/add-web-tools-feedback/evidence/probe-release.mjs
```

脚本默认检查 `/tmp/zero-waline-probe/package`；其他目录可设置 `WALINE_CANDIDATE_ROOT`，同级需有下载的 `waline.tgz`。tarball 已包含 core，最小复现不需要安装完整 server 依赖。

## 暂停范围与继续条件

- 1.1 调查完成；1.2 仅 core 层局部可行，尚未证明整个服务可薄适配，因此不勾选。
- 1.3 尚未完成直接 HTTP 全路由负向矩阵。发布 `openapi.yaml` 列出 comment、comment/{id}、comment/rss、token、user、user/{id}、db、oauth；源码还包含 article、verification、user/password、token/2fa、根入口、`/ui`、REST method override 与前缀别名。上述均须在 facade 路由清单中处理。不能将 core 权限断言当作所有 HTTP 路由已隔离。
- 2–6 依赖候选门禁，保持未完成；7 的真实账号、资源与部署项目也保持未完成。没有以本地 mock/core 结果替代它们。
- 继续前需明确该固定发布版的许可依据；若继续复用 Waline，则下一步验证完整 server 的外部 OAuth/后台资源、原生接口封锁、纯文本 facade 和持久存储契约。若更换候选，先更新 design/依赖评估，再重复同一门禁。不能用自行开发认证/评论平台或大型 fork 默默替代已批准设计。
