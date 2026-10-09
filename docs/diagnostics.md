# Zero 本地日志与诊断接入

当前实现：`improve-about-and-add-diagnostics`，2026-10-09。验证记录见[本次证据](../openspec/changes/improve-about-and-add-diagnostics/evidence/verification.md)。Windows 实机、签名 File 包和公开 Web runtime 的验收仍独立进行。

## 用户排障流程

1. 打开关于 Zero。GitHub 指向 `https://github.com/bells/zero`；官网先使用 `https://www.usezero.cn/`，站点尚未建设。
2. 点击“复制诊断信息”先生成预览。摘要列出平台/架构/版本、已装工具 ID/版本/状态、已有的健康缓存和最近最多 50 条 Warn/Error。
3. 查看数据范围及缺失提示，再点击“复制这份摘要”。复制的是这份预览的原文；修改模式或后台发生新事件不会偷偷改变复制内容，需要刷新才能获得新快照。
4. “报告问题”只打开 `https://github.com/bells/zero/issues/new/choose`。URL 没有摘要或诊断 query；粘贴和提交由用户操作。
5. “打开日志目录”打开 `~/.zero/logs/`。日志是 JSONL；使用阶段和事件码排查，原来的工具错误文案仍保留在工具界面。
6. 临时详细诊断最多 15 分钟，重启恢复普通模式。详细模式增加原生操作计时事件，仍不采集业务内容，也不打开 `ZERO_PERFORMANCE_TRACE`。
7. 清理需要在界面确认；只删除诊断文件、内存事件和预览，不删除 registry、工具缓存、截图、文档或转换结果。

摘要会暴露已装工具的 ID 和版本。预览只使用本进程的安全事件，不读取旧日志来补齐历史；尚未初始化的工具显示 `notInitialized`，禁用显示 `disabled`。快照超时显示 `unknown` 并添加 omissions，不能据此认定工具损坏。

## 模块与权限边界

| 位置 | 职责 |
| --- | --- |
| `services/diagnostics/{contracts,events,storage,mod}.rs` | 安全 DTO、事件目录、资源预算、持久化、快照与租约 |
| `commands/diagnostics.rs` | 原生 about caller 校验；固定支持目标与日志目录；原生 clipboard 写入 |
| `bundled_plugins.rs` | 注册五个工具的廉价状态适配器 |
| `src/core/diagnostics/`、`src/services/diagnosticsService*` | 对称 TS 契约、typed service、异步交互状态 |
| `AboutPanel.tsx` | 项目地址、支持入口、诊断预览、明确复制和清理确认 |
| `appShell/DiagnosticBoundary.tsx` | 内置 panel 和专用工具 surface 的固定 UI 失败事件 |
| `plugins/{protocol,session,web_runtime}.rs`、`src/sdk` | 尚未公开发布的隔离会话只写诊断方法 |

Rust 负责文件、系统调用、真实调用者、时间、来源和资源限额。React 只发送受限请求并呈现反馈。core 不导入具体插件；新工具在组合层注册适配器，不能依赖其他工具实现。

只有原生 `about` window 能读取、复制、清理、修改模式和打开诊断支持目标。第三方 `plugin-*` 仍受默认拒绝的 invoke gate 保护。File engine 不拥有这些命令的访问权，也没有 clipboard/log/opener 的通用 capability。

## 事件字段与隐私

事件包含 `schemaVersion`、UTC `timestamp`、`level`、`source`、`pluginId`、`code`、`phase`、`outcome`、独立随机 `runId`/`operationId`、具名 `metadata`、`repeatCount` 和清理用 `storageEpoch`。

- `outcome`：`started / succeeded / failed / cancelled / unsupported`。取消不是故障；平台支持只来自实际 capability 和缓存状态。
- `metadata` 只允许 u32 `count / durationMs`、100–599 的 `httpStatus`、注册 backend enum、`cacheHit / approved / devFallback` 布尔值。provider 详情使用固定枚举和经过格式校验的版本；不保存 displayName 或 provider 原始异常。
- code 最多 64 ASCII bytes，phase 最多 32，必须由小写字母开头，后续只允许小写字母、数字、`.`、`_`、`-`。主机生产者传静态代码；第三方代码属于 self-reported 内容，不能改变权威健康状态。
- 禁止 message、stack、stderr/stdout、环境变量、任意 metadata、文档、像素、文件名/路径、窗口标题/坐标、剪贴板文本、查询词、最近使用记录、URL/headers/body 和授权 token/session/lease。
- 防护主要是拒绝自由文本与未知字段，在序列化前校验安全字符、版本、数字范围和总字节数；最终字段检查还拒绝 code/phase 中常见的 `sk- / sk_live_ / ghp_ / github_pat_ / xoxb-` 等凭证前缀。摘要再投影出安全 registry/health 字段；不对原始异常做“遮住用户名后继续保存”。

只给公共安全事件建立独立 `tracing::Dispatch`。不安装依赖全局日志 subscriber，不接管 console、panic stack 或 reqwest/Wry 的自由文本。第三方可以自行编码事件名称，因此应继续要求其代码使用静态事件目录，不能把插件自报内容视为宿主事实。

## 预算、故障与生命周期

| 对象 | 实际限制/行为 |
| --- | --- |
| 单事件 | 完整 JSONL 含 newline ≤4 KiB |
| 内存 ring | 200 条；同来源/工具/等级/代码/阶段/结果/关联 ID 在 10 秒内合并；重复数在内存快照可见，磁盘保留首次样本 |
| writer queue | appender 非阻塞队列 512；溢出不阻塞业务，累计丢失数可见 |
| 磁盘 | 每小时轮转；每文件最多 4 MiB，最多 6 份共 24 MiB，超过 7 天清理 |
| 文件预算满 | 当前小时停止落盘并计数，ring 继续更新；下一小时可恢复写入，历史丢失仍显示 |
| 持久化状态 | `healthy / memoryOnly / degraded`；不能初始化或取得 writer 锁时仅内存；写入、预算、队列或限流丢失可见为降级 |
| 单实例 writer | 文件锁；第二 writer 不共享写入权限，不争抢同一归档 |
| 权限/目录 | Unix 0700/0600，拒绝符号链接目录/文件；Unix 每次写入复核目录 inode，Windows 使用用户 profile ACL，需实机验证 |
| clear | 锁定 sink，再更新 epoch；旧队列记录不能重新落盘；删除失败返回 typed error 并显示降级 |
| 快照 | 每适配器 200 ms，总计 2 秒；registry 忙立即返回可重试错误；不启动网络、扫描、watcher、provider 探测或 engine |
| 预览 | 最多 2 份，每份 ≤64 KiB，5 分钟租约；绑定 about；关闭/清理会撤销已生成和正在生成的预览 |
| 退出 | 提前停止 Awake、清理 File/Snap、释放适配器 AppHandle；writer 最多等 1 秒；强杀不能保证最后消息完整 |

计数属于进程累计值，清理日志不会伪造“从未丢失”。锁文件不属于要删除的日志。`tracing-appender` 提供轮转/归档与非阻塞 worker，预算层负责文件大小、有效目录、epoch、Write 错误与状态。

本次锁定版本：tracing 0.1.44、subscriber 0.3.23、appender 0.2.5、官方 clipboard-manager 2.3.3、time 0.3.47。subscriber 关闭默认 feature，仅开 fmt/registry。time 声明 MSRV 1.88，标准库文件锁 API 需要 Rust 1.89；本机验证使用 Rust 1.95，未声明已跑过最低版本工具链。clipboard 的 arboard 等依赖增加原生构建输入，没有添加通用 WebView clipboard 权限；前端依赖不变。维护依据及候选库比较见[设计](../openspec/changes/improve-about-and-add-diagnostics/design.md)。

## 五工具与宿主事件目录

所有原生目录内的阶段可产生 `<phase>.result`；详细模式额外产生 `<phase>.timing`，只带 bounded duration。一个原生操作的 started/terminal 使用同一诊断 ID，前端不重复记录返回的业务失败。嵌套阶段（如 download→apply）各自负责自身结果。

| Owner | 已接入的阶段/入口 | 健康信息 |
| --- | --- | --- |
| Host | 迁移前 bootstrap、migration、窗口、shortcut、status-bar、原生 autostart、registry load/save、market refresh/fetch、package intake/validation、lifecycle、shutdown | About package metadata + 安全 registry ID/version/enabled/health |
| Snap | capture 与只读权限 preflight、targets 降级、session/cancel、commit、copy/save/pin、owned media cleanup | macOS custom / Windows system / unsupported backend，pin 数量 |
| Awake | enable/disable、expiry、backend、owned child 意外退出和清理 | 已有 session + cached backend fault；原生监测不依赖 About 可见 |
| Paper | fetch/network timeout、download、cache、preview、apply、export、cleanup | 仅 `last_refresh` 缓存，不调用会读取磁盘的完整 snapshot |
| Launch | initialize、index、cache/usage 写入、watcher、shortcut、activate/focus/settings | 既有 index revision、数量和 bounded diagnostics 的状态；不枚举查询/最近记录 |
| File | provider、policy、identity、signature、assets、engine-create、readiness、validate、execute/cancel、output、cleanup | 已有 capability cache，provider/engine/package 安全版本，批准事实与实际 probe/window fallback 缓存 |

Snap 的 preflight=false 记录 `permission.not_confirmed`，不会自行请求额外权限，也不把任意 capture 错误断言为权限拒绝。Windows 仍使用系统截图 launcher。

Awake 原生观察仅监测已拥有的 macOS child；发现退出后诊断健康为 degraded，保留既有 session/业务返回形状。Windows native power 的返回失败亦记录 backend；不能据此声称 Windows 实机已验证。

File 的详细类别由 typed error 映射：`provider.unavailable / version_unsupported / permission_denied / activation_failed`、`execute.timeout / cancelled`、`input.password_required / ocr_required / unsupported / invalid`、`output.conflict / permission_denied / invalid / missing`、`provider.failed / worker.unavailable`。engine 的原始 diagnostic 仍只在原业务边界内处理，公共日志没有读取它。

File 未批准包、identity/signature/assets 失败和 readiness 超时不是同一个根因。看到“修复或重新安装”应先查这些具体阶段和缓存 facts。`approved=false` 或 `devFallback=true` 不意味着可以批准候选包；快照不为补齐信息启动引擎。

## 内置工具示例

```rust
let mut diagnostic = crate::services::diagnostics::Operation::new(Some("zero.paper"), "apply");
let result = existing_apply().await;
diagnostic.finish(&result);
result // 保留原业务 Result；不 format 原始 error 到日志
```

缓存适配器由组合层注册，读取使用 `try_lock / try_read`；只能返回 `HealthSnapshot` 的具名字段。UI import/render ErrorBoundary 只发 `ui.render_failed`；未来 UI load/transport 入口只能使用 `ui.load_failed / ui.transport_failed` 和原生白名单中的窗口/工具映射。File engine 排除在这些前端全局入口之外。

```typescript
const preview = await invoke<DiagnosticsPreview>("get_diagnostics_preview");
await invoke<void>("copy_diagnostics_preview", { input: { previewId: preview.previewId } });
await invoke<void>("open_support_link", { input: { target: "website" } });
```

对应 Rust `PreviewCopyInput / SupportLinkInput / ModeInput` 均使用 `deny_unknown_fields`。复制不接受文本或任意路径；业务组件优先使用 `diagnosticsService` 和 `useDiagnostics` 处理 unknown 错误、安全本地化键及生命周期。

## 第三方 SDK：开发草案

公开 Web runtime 保持关闭。此方法随未发布的 API 1.0.0 开发协议增加，不是 Host 0.1.0 对外开放插件的承诺。

manifest/schema 2 必须显式声明 `diagnostics.write`，并通过宿主现有审批获得这个 grant。旧 `ui.message` 不自动继承它。`diagnostics.emit` 仅接受四字段：

```typescript
import { emitDiagnostic } from "../../../src/sdk"; // 见 examples/plugins/diagnostics-draft
const acknowledgement = await emitDiagnostic(context.bridge, {
  level: "warn", code: "conversion.failed", phase: "execute", outcome: "failed",
});
if (!acknowledgement.ok) {
  // unsupported / permission.denied / rateLimited：仍按原业务流程处理。
  // 不用 console 或直接 Tauri 调用作为持久化旁路。
}
```

SDK 返回 typed `Result<null>`，不 throw 来中断原业务。宿主在提交时按 registry→session→diagnostics 的锁顺序再次检查启用、真实 package owner/version/digest/root、当前授权、generation、deadline 和 cancellation，随后注入真实 pluginId/source。插件不能提交 host 身份或任意 metadata。

每插件 60/min、burst 10、每秒补 1 个 token；最多缓存 64 个活跃限流条目。旧 JS `diagnostics.report` 只保留即时兼容回调，输入 message 被丢弃，回调只能收到固定 `legacy.report_received`；它不是新日志 API，目前没有公共持久化适配器。

新增工具的接入顺序：定义静态事件目录 → 在原生 owner 保留 Result 的前提下接入 → 注册 cached snapshot → 只补 UI 独有故障 → 添加成功/取消/权限/worker 失败及隐私 fixtures → 分别记录自动、macOS、Windows 证据。不要仅新增 console 调用或把整个业务错误对象塞入日志。
