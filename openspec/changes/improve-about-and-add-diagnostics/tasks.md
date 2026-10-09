## 1. 契约与依赖

- [x] 1.1 核对当前 protocol/File/性能活跃变更，建立事件目录、允许字段和来源/工具/窗口映射；验收：交付诊断接入说明，并与设计矩阵及三个 capability 的场景逐项对应。
- [x] 1.2 添加 `tracing`、`tracing-subscriber`、`tracing-appender` 和仅原生使用的官方 clipboard-manager 依赖，锁定兼容版本/MSRV；验收：`cargo check --locked` 通过，记录大小/维护依据，不引入通用 WebView clipboard/log 权限。
- [x] 1.3 定义对称的事件输入、安全 metadata、AboutInfo、DiagnosticsPreview、DiagnosticsError、支持目标和临时模式 Rust/TS DTO；验收：共享 fixture 覆盖 enum/camelCase/null/缺失字段/整数和非法字段，TS 类型检查与 Rust serde 测试通过。

## 2. 宿主诊断基础设施

- [x] 2.1 在迁移前初始化诊断内存状态与随机 run/operation 标识，注册明确的事件入口；验收：bootstrap/迁移模拟失败可记录安全阶段，logger 失败不终止启动、不复用授权 token。
- [x] 2.2 实现白名单字段、错误类别映射、UTF-8 安全限制和最终 scrub，限制 production sink 只接收公共安全事件；验收：合成凭证、HOME/Windows 路径、文件名、URL query、搜索词、stderr、文档内容和依赖自由文本全部不进入文件/ring/摘要。
- [x] 2.3 复用 appender 的每小时轮转和归档限制，添加 4 MiB 单文件预算、24 MiB 总额、7 天保留及安全目录/权限检查；验收：使用临时目录和可控时钟测试跨小时、重启、过期清理、符号链接拒绝和归档上限。
- [x] 2.4 实现 200 条 ring、512 条 writer queue、同码合并、落盘拒绝/丢失计数和明确 healthy/memoryOnly/degraded；验收：queue saturation、文件预算满、permission denied、disk-full/Write failure 故障注入不阻塞工具且状态可见。
- [x] 2.5 管理 writer 所有权、单实例写入锁、进程 guard、1 秒退出 flush 与递归保护；验收：双实例、重启、writer 失败和有限 flush deadline 测试通过，异常强杀不声明完整落盘。
- [x] 2.6 实现 normal/最多 15 分钟 verbose 模式及重新启动恢复；验收：可控时钟测试到期/重启恢复，Debug/Trace 仍脱敏且不开启 ZERO_PERFORMANCE_TRACE。

## 3. 快照与支持操作

- [x] 3.1 通过组合层注册廉价状态快照接口，采用每适配器 200ms/总计 2 秒预算、最多 50 条 Warn/Error 和 64 KiB 摘要；验收：partial/timeout/truncation/disabled/notInitialized fixture 通过，读取不触发网络、watcher、扫描、provider 或 engine 初始化。
- [x] 3.2 添加 About metadata 和固定支持目标命令，Rust 复用 opener 打开 GitHub/usezero.cn/Issues 与规范日志目录；验收：caller/enum 负面测试拒绝任意 URL/path，原生 opener 失败返回 typed error。
- [x] 3.3 实现 caller-bound preview 租约（最多 2 份、每份 64 KiB、5 分钟）、刷新与 clipboard copy；验收：副本字节等于预览，过期/其他窗口/任意文本/关闭撤销测试通过，剪贴板失败不显示成功。
- [x] 3.4 实现需用户确认的 clear 操作、writer 协调与预览/ring 清理；验收：并发清理/写入和删除失败测试通过，registry、业务缓存、截图和合成文档保持完整。
- [x] 3.5 对 read/copy/clear/mode/directory/link 单独执行原生 about caller 检查，注册窄 frontend ingest 的合法 label/code/plugin 对应；验收：main/tray/工具 ingest 合法组合通过，File engine、plugin-* 和未知 caller 全局命令均拒绝。

## 4. 关于页交互与布局

- [x] 4.1 添加 typed service 和 `useDiagnostics`，封装 unknown 错误收窄、独立 pending/error/success 和 request disposal；验收：类型构建通过，服务级结果/取消/过期状态验证不产生无处理 rejection。
- [ ] 4.2 更新 AboutPanel 身份/真实版本、项目链接、支持按钮、折叠统计和诊断预览，更新 about 原生尺寸与内部滚动；验收：真实桌面展示全部入口，最小尺寸/放大字体下内容可达，原工具选择与关闭行为保留。
- [x] 4.3 完成中文/英文标签、分类和错误映射、焦点/tab 顺序与 live feedback；验收：中英文真实界面、键盘操作、40px 点击目标及 pending/失败/成功反馈人工核对并记录。
- [x] 4.4 接入“首次生成预览后显式复制”、刷新、清理确认、verbose 到期状态和 Issue 外部打开；验收：不自动复制/上传，Issue URL 无诊断 query，剪贴板只包含用户看到的摘要。

## 5. 宿主和五工具接入

- [x] 5.1 宿主 bootstrap/migration、窗口、快捷键、status bar/autostart、registry/market/package/lifecycle 加入受控事件；验收：模拟权限/安装/清理失败保留原业务 Result 并产生可信阶段码，无原始 payload 泄漏。
- [x] 5.2 Snap 接 capture permission/target/session/commit/copy/save/pin/cleanup 及前端独有失败；验收：安全合成场景覆盖权限拒绝和输出失败、native/frontend 不重复报同一失败，media/title/geometry/lease 不落盘，Windows launcher 边界不变。
- [x] 5.3 Awake 接 enable/disable/expiry/backend/child/cleanup 及 cached health；验收：正常到期、模拟后端失败和关闭清理分类正确，process 输出/参数不落盘。
- [x] 5.4 Paper 接 fetch/download/cache/preview/apply/export/timeout/cancel，快照只读已有状态；验收：网络失败保留旧缓存、apply 失败与 download 区分、原 URL/保存路径/图片不落盘。
- [x] 5.5 Launch 接 initialize/index/cache/watcher/shortcut/launch/focus/settings，保留原 64×512-byte diagnostic contract；验收：原测试仍通过、状态读不重复记录，合成查询/应用路径/最近记录不落盘。
- [x] 5.6 File 接 provider/package-policy/identity/signature/assets/engine-create/ready/job/output/cleanup 各阶段；验收：阶段 fixture 区分“未批准包”“资产异常”“readiness 超时”和转换失败，devFallback/approved 如实显示且不启动引擎做快照。
- [x] 5.7 File engine 沿用 lease/session bridge，将 engine 原始异常映射为安全代码，所有插件 service/hook/ErrorBoundary 只补 frontend 独有事件；验收：engine 无全局诊断/clipboard/opener 权限，业务失败文案保留且文档数据/授权标识不落盘。

## 6. 隔离第三方与 SDK

- [x] 6.1 在 manifest/schema/compatibility/审批 UI 同步新增 `diagnostics.write`，旧 grant 不自动迁移；验收：未知/缺失/拒绝/批准权限 fixtures 与 TS/Rust schema 验证一致，公开 runtime 开关不变。
- [x] 6.2 在 Rust/TS method map 加 `diagnostics.emit` 严格四字段和 null acknowledgment，走 native session owner/live grants/commit-time recheck；验收：冒用 identity、stale generation、禁用、授权撤销、未知字段、凭证泄漏和取消后 admission 负面测试通过。
- [x] 6.3 加每插件 60/minute、burst 10 限流及 self-reported 来源，并限制 code/phase/outcome 字符与长度；验收：flood 不影响宿主/其他工具，返回 typed rate-limit 且统计可见，插件事件不改变 host authoritative health。
- [x] 6.4 SDK 添加 helper、开发示例和 unsupported-method 处理，审查旧 diagnostics.report 回调不形成自由文本持久化旁路；验收：旧宿主无方法时业务继续、无直接 Tauri/console fallback，测试/开发说明表明公开 API 尚未发布。

## 7. 完整验证与接入文档

- [x] 7.1 顺序运行 `pnpm test`、`pnpm build`，执行 cargo fmt/check/test `--locked` 和 `git diff --check`；验收：保存真实检查结果，沙箱原生失败保留首轮证据并按许可定向/串行诊断，不并发准备 fixtures。
- [x] 7.2 构建后运行 `node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json`，检查诊断服务没有 eager-load 五工具 UI/engine；验收：bundle gate 通过且未重写 tracked 历史 evidence。
- [ ] 7.3 使用 `pnpm tauri dev` 验证 macOS 关于页项目链接、日志目录、预览/复制、清理、verbose、五工具失败/取消/禁用及后台状态；验收：交付真实步骤/观察，使用合成内容，不改私人数据或 File 包审批。
- [ ] 7.4 在 Windows 设备验证目录/opener/clipboard/ACL、轮转/退出、Awake/Launch/Snap system launcher 和可用 File provider 的诊断；验收：单独记录设备证据，未运行项目保留未勾选并明确 pending，不从编译推断设备支持。
- [ ] 7.5 记录普通/verbose 下诊断开销、queue/ring/file 实测上限和 About 快照 latency，至少包含高噪声及隐藏 UI 场景；验收：交付环境/样本与 loss 状态，区分设计预算和测量结果，不宣称旧性能任务自动完成。
- [x] 7.6 维护 `docs/project-overview.md` 和诊断接入指南（事件目录、错误分类、五工具示例、第三方 grant、隐私、用户排障流程），运行 `openspec validate --all --strict`；验收：文档与实际契约匹配、规范通过，保留其他变更未完人工门禁，不自动同步/归档。

## 实施进度与未完门禁

实现和自动检查已落地，详细证据见 [verification.md](evidence/verification.md)。保留未勾选的项目按原验收范围继续完成，不用代码/单元测试替代设备证据：

- 4.2：500×560、420×360 和主窗口关闭行为已验证；系统字体放大/显示缩放尚未验证。
- 7.3：macOS 支持入口、中英文、预览/复制、过期/刷新、verbose 与清理确认取消已验证；实际 clear 删除和五工具完整故障/取消/禁用/后台矩阵待验收。
- 7.4：没有 Windows 设备证据。
- 7.5：已交付五个 synthetic adapters 的普通/详细 headless 高噪声样本；真实隐藏 GUI 的 CPU/RSS 与快照耗时待测。
