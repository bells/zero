# 独立插件基础实施记录

日期：2026-11-14。分支 `codex/core-market-tools`，基线 `6769f692c4dd7eb0b2099bdaa1fe68607d5dc5ef`。维护者已确认共享原生 provider + 独立工具包方案并要求开始实施。本记录仅覆盖首批基础代码，不代表五工具迁移或现有 core 安装包已可从市场使用它们。

## 实施结果与边界

- [五工具归属地图](ownership.md) 盘点界面、私有 import/invoke、后台业务和原生资源的所有者；明确 Paper 选图、Launch ranking、Awake 配置等领域策略不能仅换目录后继续堆在宿主。
- SDK 公开协议/诊断/版本/能力类型归入 `src/sdk/`，core 保持兼容 re-export，host-only registry DTO 没有泄入 SDK。新增本地 `@zero/sdk` 包，可仅复制 SDK 与声明依赖构建，并以独立 NodeNext 消费声明和运行生成 JS 验证。
- Rust、SDK、JSON Schema 与作者校验支持 optional `requiredCapabilities` / `background`，共享正反 fixtures 检查 omission/null、范围、重复、路径和事件；旧 manifest 保持兼容。
- 新增实际宿主能力快照 command + TS service，实际 manifest compatibility 使用同一受测 catalog。只报告已实现的隔离 Bridge storage/message/diagnostics；未将编译进来的私有命令当作公开 provider。后台声明隐含要求尚未提供的 `background.events ^1.0.0`，不会假装可执行。
- 结构有效但宿主/API/平台/runtime/capability 不兼容的 v2 包保留 parsed manifest，以继续检查真实归档中的主入口与后台脚本；原错误保留、valid=false，安装/解压拒绝。特殊文件、symlink、路径逃逸和缺失脚本均拒绝。
- 单工具 builder 使用现有 TypeScript AST、Vite、JSZip，产出确定性根布局 `.zplugin`。源码、传递依赖、类型/动态/alias imports、真实路径、HTML/CSS 与 URL 资产均受所有权与资源限制；未运行插件的 Vite/PostCSS/安装脚本。构建报告明确不证明 publisher/release approval。
- 官方签名 verifier 使用既有 Ed25519，绑定 schema/key ID、plugin ID/version 与实际 SHA-256；固定域分隔编码。SDK/Schema/Rust 的 36 个共享签名样例一致，无生产信任配置或真实私钥，成功的身份验证不授予会话权限。

## 红绿与审查

- manifest 合法新字段原先被 additionalProperties/serde 拒绝；SDK 原先依赖缺失的 `src/core`，并发现独立 NodeNext 声明扩展名问题；均以独立构建/消费测试先见红，再修复。
- builder 初始 22 项未实现测试失败，逐步增加真实 Vite/ZIP 正反夹具。publisher 初始验证桩令 10 项真实签名用例失败；补上严格校验后通过。签名 Schema 的 permissive 桩被 26 个反例击中，再收紧为最终契约。
- 初期并行 Rust 模块编辑期间记录过 `E0432 unresolved import super::capabilities`；模块/声明就绪后通过独立和完整编译，未把这个临时结果当作 red-green 业务证据。
- 独立审查发现 P1：Vite 的 `meta content` / `link imagesrcset` 可把 peer SVG 字节带入 ZIP，而返回 sourceFiles 不含该文件。先新增真实归档泄漏测试见红，再用与锁定 Vite 一致的 parse5 AST/资产属性与 metadata 规则检查替换 HTML 正则。上游布局不识别时失败关闭，未扩大允许的资产语法。
- 修复后 builder 70/70 通过；审查代理独立重跑 HTML 专项 37/37，确认原两个绕过已堵住，未发现等价旁路。Vite 内部 parser/资产规则是显式工具链耦合，升级需重跑矩阵，不把它当作运行时安全沙箱。

## 本轮验证

| 检查 | 新鲜结果 |
| --- | --- |
| `pnpm test` | 666 通过，0 失败，0 skipped |
| `cargo test --locked -- --test-threads=1` | 汇总 488 通过，0 失败，3 ignored；均带 `--manifest-path src-tauri/Cargo.toml` |
| core 专项 Rust：build_profiles / protocol / publisher / publisher_contracts / providers / package / background_package | 47 通过，0 失败；`--no-default-features` |
| `pnpm build` | full 五工具构建通过，102 个工具源码模块 |
| `ZERO_BUILD_PROFILE=core pnpm build` | 通过，工具模块 0，无预装工具 |
| `ZERO_BUILD_PROFILE=standard pnpm build` | 通过，静态四工具仍作为当前迁移前基线；不能据此标记“同包预装”完成 |
| Rust fmt --check / cargo check --locked | 通过 |
| performance build-graph --check | 通过，输出 `/tmp/zero-core-foundation-build-graph.json`，未改写历史证据 |
| 本地 SDK build | `build/packages/plugin-sdk-development` 成功，生成物被 Git 忽略 |
| 严格 OpenSpec / 本地 Markdown 链接 / diff --check | 47 项通过 / 无失效本地链接 / 通过 |

主要长输出在 `/tmp/zero-core-foundation-*`；TDD 细项日志还包括 `/tmp/zero-capability-*`、`/tmp/zero-sdk-*`、`/tmp/zero-publisher-*`、`/tmp/zero-background-compatibility-*`。这些临时路径仅用于本次诊断，长期结论以本记录和仓库测试为准。

## 剩余工作

当前完成 OpenSpec 1.1、1.3、1.4、3.1、3.2，共 5/33；1.2 已完成 manifest/capability/background/signature DTO 和共享校验，但后续 provider 方法的权限/返回类型/资源 owner 契约仍需逐项冻结，因此保持未勾选。

尚未完成：原生 provider 与预装目录的编译拆分、后台调度/隐藏会话、完整签名信任/安装更新事务、Awake 首个真实包及其他四工具迁移、core/standard 同包分发和旧记录迁移。正式 runtime gate 保持关闭，market 仍为空；没有提供虚假下载条目、真实官方包或发布批准。

本轮未新增真实桌面/Windows 设备验收，未运行系统工具操作来替代后续迁移验收。File engine policy 不变。未提交、推送、上传、发布、归档或替换用户已安装应用。后续按批准任务继续，不能将这批基础代码表述为“core 市场安装五工具已完成”。
