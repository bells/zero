# 实施与验证记录

日期：2026-10-09。变更：`improve-about-and-add-diagnostics`。本记录只描述本地实现和实际运行的检查，不作为 Windows、移动端、正式签名包或公开插件运行时的发布证据。

## 环境与范围

- macOS / Apple Silicon，Node 24.20.0、pnpm 10.33.0、Rust 1.95。
- 实现 GitHub、用户指定官网、Issues 和日志目录的固定目标入口；加入本地有界诊断、五工具 cached health、严格支持命令、第三方开发协议/SDK。
- Rust 所有支持命令校验真实 `about` caller；clipboard 只接受预览租约。未增加通用 WebView clipboard/log 权限。
- 不采集用户文档、截图、剪贴板、搜索词、路径、URL、原始异常或凭证。仓库证据不保存实际 registry、完整应用日志或完整本机诊断摘要。
- File 批准策略、公开 Web runtime 开关、原工具 IPC/业务 Result 和 Windows Snap system launcher 边界保持原政策。

## 自动检查

| 检查 | 结果与证据 |
| --- | --- |
| `pnpm test` | 336/336 通过；共享诊断输入 corpus、服务参数/错误投影、旧 Bridge 固定码、SDK unavailable/denied/rate-limit 和原工具回归均纳入 |
| `pnpm build` | TypeScript + Vite 构建通过；保留既有大型 PDF chunk 的 Vite 提示 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | 通过 |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | 通过 |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1` | 正常 macOS 权限下串行运行，320 passed / 0 failed / 2 ignored；诊断 benchmark 已另外执行通过 |
| build graph `--check --output /tmp/zero-build-graph.json` | 通过，无 forbidden eager imports；初始 JS 275,791 bytes / gzip 84,940 bytes，最大 PDF chunk 795,338 bytes；未改 tracked 历史性能证据 |
| `openspec validate --all --strict` | 21/21 通过；不自动同步或归档 |
| `git diff --check` | 通过 |

关键测试对应：

| 领域 | 已有自动证据 |
| --- | --- |
| IPC/隐私 | TS/Rust 共用 fixtures，enum/null/整数/缺失/未知字段、身份冒用、路径/URL/控制字符、合成凭证前缀拒绝；具名 metadata 和安全版本投影 |
| 持久化 | ring 200、queue saturation、JSONL、同码合并、4 MiB 预算/重启、6 文件/7 天保留、0700/0600、符号链接/目录替换、双 writer、PermissionDenied/StorageFull/BrokenPipe accounting |
| 生命周期 | 临时模式到期/重启、clear epoch 和旧队列、删除失败、业务文件保留、1 秒退出 deadline、关闭 about 撤销已有及在途 preview |
| 摘要/支持 | 200 ms adapter timeout、partial/disabled/notInitialized、64 KiB/50 Warn/Error 限额、预览副本字节一致、caller/TTL、严格固定目标输入 |
| File 分类 | policy、identity、signature、assets、engine-create、readiness timeout、conversion、cancel、output 的共享阶段 fixture；公共日志不读取原 engine diagnostic |
| 第三方 | live owner/version/digest/root/generation/grant/enable/cancellation 提交时复核；每插件限流、宿主注入来源；旧 `diagnostics.report` 丢弃 message，只回调固定码 |

首次沙箱全量 Rust 测试出现本机 pasteboard 不可用及既有子进程测试的 1 秒超时，原始结果保留在 `/tmp/zero-diagnostics-cargo-test-first.txt`。曾有一次正常权限串行测试仍遇到该进程超时，记录为 `/tmp/zero-diagnostics-cargo-test-serial.txt`；未修改测试 deadline，定向原测试重跑通过，记录为 `/tmp/zero-diagnostics-process-rerun.txt`。最终串行结果单列，不能用后续通过覆盖首轮失败事实。

## macOS 实际界面

先运行 `pnpm tauri dev --config /tmp/zero-diagnostics-smoke.json`。Vite 在沙箱内绑定端口被拒绝，随后按允许的权限启动。为让原生 UI 自动化识别本次应用，另用临时配置构建本机 debug `.app`；只改变测试窗口初始可见性/尺寸，未安装、发布或签名批准 File 包。所有界面观察通过 CUA 的真实 WKWebView/AX 完成。

| 操作 | 实际观察 |
| --- | --- |
| 正常主窗口 → 关于 Zero | 由正式窗口 factory 创建 500×560 关于窗口；真实包版本、GitHub/官网地址及三个支持入口可见 |
| 初次“复制诊断信息” | 生成并展开可读摘要，出现独立“复制这份摘要”按钮；初次操作没有成功复制反馈 |
| 显式复制 | 点击第二步按钮后显示复制成功；Rust 租约副本字节一致另有单元测试，未读取用户原剪贴板 |
| 预览过期/恢复 | 在真实 about 留置超过 5 分钟后复制，显示“摘要已过期，请刷新后再复制”，没有成功提示；刷新后再次显式复制成功 |
| 刷新与快照 | 使用当前缓存；Paper/File 可显示 `notInitialized`，File `approved=false`；关于页没有为补齐状态启动其 provider/engine |
| 详细模式 | 显示 15 分钟倒计时；恢复普通模式。模式到期与重启恢复另有自动测试 |
| 清理 | 确认文案可见，取消后保留预览；未在实际用户数据目录执行永久删除，清理/并发/失败/业务文件保留由临时目录测试覆盖 |
| 日志目录/三个外部目标 | 原生 opener 命令未返回错误；未验证浏览器页面内容或官网联网可用性，官网仍标明尚未建设 |
| 键盘 | Tab 依次可达 GitHub → 官网 → 日志目录 → 复制诊断；使用可见 focus，支持与控制按钮 ≥40 CSS px |
| 中英文 | 在真实偏好窗口暂切 English，重新创建 about 后核对英文入口、预览和状态；已恢复原“跟随系统”偏好 |
| 关闭 | 关于窗口关闭后主窗口工具选择及 Awake 关闭状态保留；偏好窗口仍可经正常入口打开 |
| 最小窗口 | 临时 debug 初始尺寸 420×360，入口纵向排列；滚动可到达支持、诊断、摘要复制与工具详情。发现 textarea 内边距造成横向溢出后改用 border-box/minmax，重新构建并在真实窗口确认外层横向滚动消失 |

未执行系统字体放大/辅助显示缩放矩阵。未通过实际截图捕获、私人文档转换或修改 File 包审批制造故障。完整五工具的权限拒绝、后台失败、取消、禁用、worker 异常和退出矩阵仍需设备验收；源码/合成测试与上述关于页观察不能替代它们。

## 有界诊断测量

`diagnostics_admission_measurement` 是单独运行的 ignored 测试。debug/headless，五个 synthetic cached adapters 和五项 synthetic catalog；每种模式同步提交 10,000 个唯一安全事件，以制造高噪声。没有 UI 进程、真实 provider、网络、扫描或用户内容。

| 模式 | 事件数 | 接入总耗时 | 平均每条 | 快照耗时 | 预览 bytes | 退出后文件 bytes | 快照时丢失 | 状态 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Normal | 10,000 | 229.395 ms | 22.939 µs | 0.300 ms | 1,535 | 2,419,318 | 1,504 | degraded |
| Verbose | 10,000 | 229.389 ms | 22.939 µs | 0.447 ms | 1,538 | 2,439,242 | 1,464 | degraded |

以上为包含最终凭证前缀检查的一轮。这些数值是本机单次样本，含进程内校验/序列化/ring/非阻塞入队，不是 production p95、CPU/RSS、真实后台隐藏窗口或五工具端到端性能结论。snapshot 使用 Info/Debug 样本，因此最近 Warn/Error 列表为空；文件 bytes 在 shutdown 后统计，dropped 是快照时刻值，二者不用于反算完整接收数。

自动测试另验证 ring 达到 200，queue 的配置上限 512 和饱和时可见降级，单小时文件预算 4 MiB、总 24 MiB 与 6 文件限制。没有声称本次 benchmark 实测写满全部 24 MiB。后台隐藏 GUI 的 CPU/内存与真实 About 快照 latency 尚未测量，任务 7.5 保留未完成；不勾选旧性能变更的任务。

## 依赖与体积

采用 tracing 0.1.44、tracing-subscriber 0.3.23（fmt/registry）、tracing-appender 0.2.5、官方 clipboard-manager 2.3.3、time 0.3.47。维护依据与备选比较见 [design.md](../design.md)。Cargo.lock 新增 20 个 package/version 项，无前端依赖新增。time 声明 Rust 1.88；标准文件锁需要 Rust 1.89，因此项目声明 `rust-version = "1.89"`。实际测试使用 1.95，未跑最低工具链。

本机 debug 紧凑测试版原生二进制为 72,839,720 bytes，`.app` 文件合计 72,901,406 bytes。该值含 debug 符号/整个应用，没有相同配置的变更前基线，不能当作新依赖的 release 体积增量；JS 体积和 eager import 则有上述当前 gate。

## 待完成的人工验收

- 4.2：系统字体放大/显示缩放矩阵；正常与最小窗口已验证。
- 7.3：实际用户目录 clear 删除、五工具完整故障/取消/禁用及后台/退出矩阵；关于页基础支持流程已验证。
- 7.4：Windows 设备的 opener、clipboard、ACL、轮转/退出、Awake、Launch、Snap system launcher 和可用 File provider；本机无 Windows 设备证据。
- 7.5：真实隐藏 GUI 的 CPU/RSS 与快照 latency；已有 headless 高噪声测量，不能替代该项。

默认字段白名单和最终字符/凭证前缀过滤不能识别恶意插件自行编码的任意秘密。开发草案要求 code/phase 为静态事件目录，自报事件不改变宿主权威 health；公开 runtime 仍关闭。没有全局 console/依赖自由文本/panic 内容持久化旁路。

## 最终门禁记录

- 前端：336 passed / 0 failed；最终日志 `/tmp/zero-diagnostics-pnpm-test-final.txt`。
- Rust：320 passed / 0 failed / 2 ignored；正常 macOS 权限串行退出码 0；日志 `/tmp/zero-diagnostics-cargo-test-final.txt`。ignored 诊断 benchmark 另跑通过，日志 `/tmp/zero-diagnostics-measurement-final.txt`。
- build、cargo fmt/check、bundle gate 均退出码 0；日志分别为 `/tmp/zero-diagnostics-build-final.txt`、`/tmp/zero-diagnostics-check-final.txt`、`/tmp/zero-diagnostics-bundle-final.txt`。
- `openspec validate --all --strict`：21 passed / 0 failed；日志 `/tmp/zero-diagnostics-openspec-final.txt`。
- `git diff --check`：修复 LazyPluginPanel 的 EOF 空行后通过；无生成产物出现在本次 tracked/untracked 修改清单。
- 任务 31/35 完成；4.2、7.3、7.4、7.5 保留未勾选，见上述明确缺口。
- 本次 smoke 实例已退出，偏好恢复跟随系统、诊断模式为普通。实现验收阶段未提交、推送、发布或同步/归档 OpenSpec。

## 提交前复查（2026-10-09）

用户随后要求本地提交。重新执行前端测试（336/336）、生产构建、cargo fmt/check、bundle gate 与本变更 strict validation，均通过。

Rust 首轮串行检查重现既有 `direct_runner_preserves_argument_boundaries_and_bounds_output` 的 1 秒 deadline 超时，记录保留在 `/tmp/zero-diagnostics-commit-cargo-test.txt`；测试源码与阈值未修改。定向复查通过（`/tmp/zero-diagnostics-commit-process-rerun.txt`），随后无并发构建的全套串行复查为 320 passed / 0 failed / 2 ignored（`/tmp/zero-diagnostics-commit-cargo-test-serial.txt`）。

本次提交仍保留 4 项未完人工验收，不同步或归档规范；提交不代表 Windows、签名包或完整性能门禁通过。
