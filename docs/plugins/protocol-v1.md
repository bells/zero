# Zero Plugin Protocol v1 实施状态

更新：2026-10-07。当前宿主仍为 **0.1.0**。正式 Web runtime 门禁保持关闭；macOS debug 可显式设置 `ZERO_PLUGIN_WEB_DEV=1` 验证开发包。不能将清单校验成功理解为发布批准；首次公开支持窗口拟为 `>=0.2.0 <0.3.0`，须在原生 conformance gate 后冻结。此窗口是提案，尚未发布支持该 profile 的宿主。

## 版本与文件

| 项目 | 当前规则 |
| --- | --- |
| Host | 来自 Cargo 构建版本；新兼容性 command 返回 hostVersion，不由调用方填写 |
| API | legacy `"1"` 与目标 public `"1.0.0"` 区分；不自动升级 |
| Manifest | `.zplugin` 根 `manifest.json`；无 schemaVersion 为 legacy，新格式为整数 2 |
| 插件版本 | 完整 SemVer，独立于宿主；保留 Snap/Awake 的 0.1.0 与 Paper/Launch/File 的 1.0.0 |
| canonical IDs | `zero.snap`、`zero.awake`、`zero.paper`、`zero.launch`、`zero.file` 保留 |
| File 签名 | protocolVersion/packageVersion/hostApiRange 和现有签名 payload 不重解释；审批策略未改变 |

| Profile | Manifest / API | 当前运行边界 |
| --- | --- | --- |
| bundled | 编译期 metadata / 内部 typed commands | 五工具保留原生适配器与实际平台差异；外部包不能声明 bundled 信任 |
| legacy | 无 schemaVersion / API 字符串 `"1"` | 保留包、registry 与权限适配；历史 Bridge 契约不等于可加载的公开 Web SDK；script/binary 走独立受控进程路径，不属于 public v1，也不是 OS sandbox |
| public Web v1 draft | schemaVersion 2 / API `1.0.0` | 正式运行时关闭；仅 macOS debug 原生开发验证，Windows/WebView2 和打包验收待完成 |
| first-party File engine | 已有签名 engine profile | 独立审批、租约、capability 和版本校验；不会因 v2 manifest 或 SDK 获得批准 |

新范围语法支持完整 exact、caret、tilde 和空格 AND 比较器，必须有上界；不支持 `*`、OR、逗号、缺位数字。预发布默认排除，build metadata 不影响比较。版本数字不超过 JavaScript safe integer。旧范围保留 `*` 与 `>=完整版本`，`engines.zero` 优先于 `engines.ztool`。

[JSON Schema](../../schemas/plugin-manifest-v2.schema.json)、[TS 数据契约](../../src/core/pluginHost/protocol/contracts.ts)、[Rust DTO/验证](../../src-tauri/src/plugins/protocol.rs)、[共享样例](../../tests/fixtures/plugin-protocol/)是实现入口。JSON Schema 验结构，语义检查负责版本、身份、路径和贡献引用。Rust 是最终判断方。

```bash
node scripts/validate-plugin-protocol.mjs tests/fixtures/plugin-protocol/example.manifest.json 0.2.0 1.0.0
```

此命令只做离线校验，不安装、不批准、不执行插件；目前运行于仓库依赖环境，独立分发的作者工具仍待完成。调用宿主时使用 `pluginHostService.checkCompatibility({ manifest })`；对应 Rust `check_plugin_compatibility` 返回 profile、hostVersion、apiVersion 和逐项 issues。正式构建包含 runtime.unsupported；开发覆盖仍校验实际 hostVersion，不能把 Host 0.1.0 当作 0.2.0。

安装/启动/启用时，旧包继续按 legacy 规则检查；不兼容记录保留，不能通过 enable 把不兼容状态覆盖为 ready。内部接口没有变成公开 SDK，已有 native invoke 仍保留其实际 wire naming。

完整生命周期事务、命令激活和设备门禁继续以 [实施任务](../../openspec/changes/standardize-zero-plugin-protocol/tasks.md) 为准。


## 已接入的开发运行路径

- 第三方内容使用独立原生 WebView；main/tray 只提供入口。`zero-plugin://<session>/...` 同时绑定原生窗口 label，校验路径、symlink、会话有效性，并附 CSP。仅 IPC transport 可 connect；无远程资源、iframe 或任意导航。
- 应用自定义命令总入口拒绝 `plugin-*` 调用者，例外只有 ready/invoke/cancel；Tauri 插件命令受独立 capability ACL 限制。SDK 不导入 Tauri。
- `src/sdk` 提供普通 TypeScript 注册、typed Bridge、AbortSignal/dispose；React adapter 单独导入。当前实现 storage.get/set 与宿主 UI message。network.fetch 明确返回 api.unavailable；声明式命令注册也尚未开放，不假成功。
- 会话最多 32 个、每会话 32 个在途请求；64KiB 请求、1MiB 响应、10s deadline；插件存储 1MiB。请求/session ID 只接受 1–128 位 ASCII 字母、数字、下划线与连字符。JSON 整数按数值语义接受 1 / 1.0，限制为 JS safe integer。
- SDK 取消和原生 session 撤销均阻止迟到提交；取消先于 invoke 的竞态保留 tombstone。存储在会话锁外读取、序列化并 fsync staging，提交时再次校验，然后原子替换。
- 五个内置 metadata.json 被 TS 静态 import 与 Rust include_str 共同消费，不加载工具代码。registry schema 6 保存独立 protocolManifest 与单调 revision；旧 catalog projection 只供展示，不授予 API 权限。
- 恢复内置工具与逐个启停共享按 ID 排序的操作锁；原生适配与 revision 通知在锁内完成。恢复写盘失败会还原记录，重启/迁移沿用已保存 revision；并发和故障注入已有自动测试，多窗口真实桌面验收仍待完成。

示例与复现命令见 [隔离及 notes 证据](../../openspec/changes/standardize-zero-plugin-protocol/evidence/webview-isolation.md)。`node scripts/package-plugin-author-tools.mjs` 生成可独立安装 Node 依赖的 manifest 校验工具，尚不是完整包安全验证器。未发布 npm 包。

## Legacy 迁移

无 schemaVersion 的包继续走 legacy adapter；`engines.api: "1"` 不表示公开 API 1.0。迁移时先复制源码、写新的 schemaVersion 2 manifest、用 HTML 作为 main，并把直接 native 调用改为 SDK 方法；明确列出 permissions/activationEvents。不要重写已签名 File manifest，也不要把 script/binary 改名为 webview 来绕过平台与信任边界。旧 process runtime 不是公开 v1，也不是 OS sandbox。
