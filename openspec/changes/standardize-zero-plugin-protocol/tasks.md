## 1. 冻结契约与兼容性实现

- [x] 1.1 根据本提案确认的 v2/public Web profile 更新协议文档与版本矩阵；核对五个 canonical ID、旧签名 payload、首发 Host 版本窗口及当前实现与未开放公开运行时的边界。
- [x] 1.2 评估并锁定 SemVer/JSON Schema 候选库，记录维护、许可证、体积及 npm/Rust 语义差异；用 exact/caret/tilde/AND/prerelease/build metadata corpus 验证选择，不手写完整比较器。
- [x] 1.3 完成 JSON Schema、Rust Manifest/Bridge DTO 与 TypeScript 对应接口；以共享正反 JSON fixtures 验证字段、null/omission、未知字段、路径与贡献引用一致。
- [ ] 1.4 在现有 plugins 目录增加版本/平台/profile 校验及 check_plugin_compatibility command；验证安装、启动、enable、activation 均拒绝不兼容项并返回 required/actual 诊断。
- [x] 1.5 实现 legacy adapter，覆盖 engines.zero/ztool 优先级、API 字符串 1、缺失 engines、旧 ID 和权限保留；用 registry fixtures 与 File signature fixtures 证明无破坏性改写。
- [ ] 1.6 为公开 Web v1 建立方法/权限/provider 映射，验证未知权限、缺 provider、network scope/redirect/private IP 均返回失败且无副作用。

- [x] 1.7 改造包下载为流式大小限制与增量摘要，验证缺失 Content-Length、超限响应、重定向、摘要不符、解压累计限额和 staging 清理；保留 File 签名审批。

## 2. 实现可验证的 Web 会话与 Bridge

- [x] 2.1 添加 Rust session owner/generation 与可信窗口绑定，验证伪造身份、跨插件 token、禁用/过期 session 和调用者不匹配均被拒绝。
- [ ] 2.2 实现 session-scoped package asset route 和精确 CSP，验证 traversal/编码绕过/跨包资源/远程导航拒绝；在 WKWebView 和 WebView2 分别证明合法 HTML/CSS/JS 能加载，未证明的平台不开放 profile。
- [ ] 2.3 接入独立 WebView、原生调用入口限制与注入 transport 握手，验证 public storage/message 请求从插件窗口到 Rust 再返回，并实测 raw IPC 不能调用宿主命令；源码扫描证明 SDK 没有 Tauri 导入。
- [x] 2.4 实现 typed method dispatch、大小/并发/deadline 限制与请求去重，使用负面 fixtures 验证超限和重复请求不触发第二次副作用。
- [x] 2.5 实现 SDK AbortSignal 与 host cancellation/late-response 丢弃，测试取消、停用、换代及底层不可取消操作结束后的提交检查。
- [ ] 2.6 实现声明式 view/command 激活与 ready 超时，验证 enabled-idle 无插件 JS/展示计时器、命令等待正确 view 后仅执行一次、失败不影响其他插件。

## 3. 生命周期、状态同步与事务

- [x] 3.1 为宿主 coordinator 建立 per-plugin operation gate 和可注入 bundled adapters，测试 commands/plugins.rs 不再重复 File/Launch 后处理且 core 不导入具体插件。
- [ ] 3.2 实现 revoke-first、bounded deactivate 和无条件资源清理，测试 hook 抛错/超时、重复 dispose、禁用后新请求失败及 WebViews/listeners/leases 终态计数。
- [ ] 3.3 引入 Rust registry revision 和窗口失效通知，测试重复/乱序事件、两个窗口禁用、重连完整快照及合并刷新不回退状态。
- [ ] 3.4 将 package 准备/哈希/解压移到 registry 全局锁外，以短锁与单写入 owner 提交；用并发安装/list/disable 和持久化故障注入证明事务一致性，并交叉引用原性能任务 9.3。
- [ ] 3.5 实现更新权限 diff、旧会话 drain、失败激活回滚和崩溃恢复记录，测试拒绝审批、同版本不同摘要、fsync/rename 失败及启动中断恢复。
- [ ] 3.6 实现卸载默认保留数据及显式删除数据选项，测试只删除插件所属包/缓存、保留用户导出和旧迁移源，并验证 File 在用租约返回 busy。

## 4. 逐个对齐五个内置工具

- [x] 4.1 以插件自有 JSON metadata 建立 TS import / Rust include 静态目录，保持 loaders 与 native adapters 独立；以 drift/重复 ID/贡献缺失测试及现有 module boundary 测试验收。
- [ ] 4.2 对齐 Snap metadata/快捷键/capture 资源 owner，验证 disable 释放快捷键、拒绝新 capture、保留现有 pin 生命周期；分别保留 macOS 编辑器与 Windows 系统截图验收结果。
- [ ] 4.3 对齐 Awake lifecycle，将多 sleeping expiry threads 改为单一可取消 owner；测试频繁切换时长、过期竞态、禁用停止原生会话和隐藏 UI 不停止会话。
- [ ] 4.4 对齐 Paper contribution 与生命周期适配，验证 refresh/preview 取消、下载/应用的既有 job 策略、对象 URL 清理和状态栏派发不回归。
- [ ] 4.5 对齐 Launch watcher/query/shortcut owner，验证停用与重启、旧 generation 不发布、indexed ID 拒绝任意路径及查询/图标调度不回归。
- [ ] 4.6 对齐 File metadata 和 lifecycle invalidation，验证 engine lease/drain/取消/busy/回滚、独立 capability 与签名/审批 fixture；保持未批准策略不变。
- [ ] 4.7 在多窗口场景验证状态栏/快捷键冲突及用户覆盖，记录 icon 创建/解码/刷新次数；只对实测瓶颈做差量更新，不把常量分支本身当性能缺陷。

## 5. SDK、示例与作者文档

- [x] 5.1 建立仓库内私有 SDK 核心及可选 React adapter，验证 plain TypeScript 与 React 两种用法、type-safe payload/result、registration/dispose 和错误收敛。
- [ ] 5.2 提供只用公共 API 的 notes 示例源码与可重复打包命令，验证生成包通过 schema/host 检查并完成安装、审批、激活、存储、停用/重启、卸载闭环。
- [ ] 5.3 提供离线 manifest/包验证命令及 legacy 迁移指南，验证示例错误能定位字段并区分 schema/API/Host/平台问题；不依赖开发者安装 Zero 源码工具链。
- [x] 5.4 更新现有 MVP/developer/publishing 文档和项目维护地图，以源码与运行证据校准“支持”表；把 legacy process runtime 明确列为非 public v1，不宣称 OS sandbox。

## 6. 集成与发布门禁

- [x] 6.1 串行执行 fixture preparation 相关测试，运行 pnpm test、pnpm build、cargo fmt/check/test --locked 和 git diff --check；保留首次失败与针对性重跑证据。
- [x] 6.2 构建后运行 node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json，验证 SDK/metadata 没有把 File/Capture 等变为 eager import；不覆写历史 evidence。
- [ ] 6.3 在 macOS pnpm tauri dev 与打包应用验证真实第三方加载、两窗口同步、审批、快捷键冲突、超时/hung-WebView 恢复及五工具原生 smoke，记录测试包摘要与结果。
- [ ] 6.4 在 Windows WebView2 与打包应用执行对应插件/快捷键/恢复用例，记录设备与结果；未有设备证据则保持 pending，不用 CI 编译替代。
- [ ] 6.5 按同一协议测 10 次加载/卸载终态资源、进程树 CPU/RSS 和冷/热激活 p50/p95，标注 proposed vs measured budgets；不替旧性能 change 自动完成 100ms/15% 门禁。
- [ ] 6.6 运行 openspec validate --all --strict，核对原 change 的 manual tasks 未被误勾选；交付 conformance 报告后再决定 API 1.0 freeze、Host 首发版本和 SDK 发布，提交/发布/归档须另在授权范围执行。


## 2026-09-28 实施进度说明

已勾选项对应当前源码和自动验证，不代表正式发布。独立 WKWebView 的 raw IPC 拒绝、无限循环窗口销毁以及 notes 存储/停用/重启/卸载已有本机原生证据。2.2 保留 Windows pending；2.3 已通 storage，但完整 shell/message/跨窗口原生验收未齐；2.5 正在补取消早于 dispatch 与存储 staging 竞态；3.1/3.3、4.2/4.3/4.5/4.6 已有实现但仍需完整并发/设备验证。network、声明式 command、更新回滚/恢复、短锁提交、显式删除数据、Paper 原生取消和完整性能测量尚未全部落地。

## 2026-10-07 实施进度说明

本轮完成 1.1、2.5、3.1、5.4、6.1、6.2，总计 14/36。恢复内置插件已与单插件启停共享操作锁，失败写盘会还原内存记录；重启与迁移不再重置 registry revision。取消、停用、换代、deadline 后已准备的存储提交通过真实文件断言验证；SDK pre-abort、lifetime abort、timeout 与迟到回复已验证。3.3 的源代码修正不代替两窗口真实验收，该项继续待办。证据及限制见 [conformance-2026-10-07.md](evidence/conformance-2026-10-07.md)。旧变更 manual tasks、File 审批和公开 runtime 门禁保持原状态；未提交、发布或归档。

本机 UI 后续验证：以本地 debug `.app` 和可见主窗口测试配置绕过裸进程识别问题，真实桌面主窗口/偏好/关于、五工具面板、Launch 原生查询与 public runtime 拒绝已通过，见 [macos-ui-2026-10-07.md](evidence/macos-ui-2026-10-07.md)。6.3 仍需覆盖完整第三方审批/激活、双窗口同步、冲突、超时恢复及各工具的原生操作，未因基础 UI smoke 提前勾选。
