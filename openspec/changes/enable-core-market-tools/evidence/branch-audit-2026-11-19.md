# Core 市场迁移梳理 2026-11-19

## 分支与交付边界

目标分支为 `codex/core-market-install-experience`。本轮起始提交 `e568f4b` 在本地 `main` 的 `4c35fb9` 之上增加一个提交，起始工作区干净。该提交包括 Core 0.2.0 市场安装界面、同一份双语市场目录、官方签名验证、后台事件、Awake 和 Paper 独立包，以及 Launch 原生发现和搜索基础。本轮变更在该 worktree 上保留为未提交改动。

`enable-core-market-tools` 仍为 5/38。勾选项覆盖所有权盘点、独立 SDK、包源边界、打包入口、签名验证基础。平台功能、设备验收、正式安装与更新事务仍各自按 [tasks.md](../tasks.md) 的完成条件判断。

## 五个工具

| 工具 | 当前产物与证据 | 仍待完成 |
| --- | --- | --- |
| Awake | 本地独立 0.1.0 候选。已有维护者 macOS QA 记录，覆盖启动、倒计时、重开、停用、卸载及保留设置重装 | 正式签名包和平台发布。完整后台和 Windows 验收按任务表继续 |
| Paper | 本地独立 0.1.0 候选。维护者已在 macOS QA 验证预览、切换日期、保存、手动应用、停用/启用、卸载重启、重装并保留应用记录 | 每日自动执行、旧内置配置迁移、Windows 设备及发布验收 |
| Launch | 新增 macOS 0.1.0 候选。Core 按视图发现和分页返回应用，包内进行搜索、键盘操作和成功后保存使用记录 | 安装态快捷键、浮动窗口、图标、系统设置、运行状态、旧使用记录迁移、Windows 原生激活和功能对照验收 |
| Snap | 新增 Windows 0.1.0 候选。通过生效会话的截图权限调用系统截图片段入口，Windows 自己处理选择和结果 | Windows WebView2 内实际安装与操作、快捷键和 OCR。macOS 需要迁移编辑器/钉图页面、原图与写回租约、剪贴板及 OCR，当前由静态模块承担 |
| File | 源码仍通过 `file-tool` 组合引擎 WebView、作业队列和受控输出。发布策略的 `approvedEnginePackages` 为空，候选引擎为 1.3.0 | 独立 UI 包、Core 的引擎能力、文件选择令牌、按已安装包身份隔离作业和取消。引擎签名、批准摘要与封装后的质量测试仍是交付依赖 |

此前的原生验收见 [Awake](awake-native-qa-2026-11-16.md) 和 [Paper](paper-native-qa-2026-11-18.md)。

## 两个新候选包

| 归档 | 平台 | SHA-256 |
| --- | --- | --- |
| `zero.launch-0.1.0.zplugin` | macOS | `88d9c3bfbd0adf4f514d1473d96e451cc500b054ca794a3baa0c18026408583d` |
| `zero.snap-0.1.0.zplugin` | Windows | `47d65d2aabe0f8f52873ee06d0004ef0f32f662437a9f994b40c89dcd4d848f9` |

归档存放于工作树的 `build/core-market/packages/`，清单、HTML、CSS 和 JS 各一份。两包仅通过 SDK 调用宿主，按 0.2.0 宿主兼容窗口验证。另生成 `build/core-market/qa/example.launch-0.1.0.zplugin`，其 manifest 使用开发 ID，其余文件字节与 Launch 候选一致。安装这份派生包使用隔离 Registry 和 macOS 调试运行时。

Launch 的请求和返回契约见 [SDK](../../../../src/sdk/README.md)。宿主以会话绑定失效目录，检查原始与当前授权，重验路径身份后才交给 macOS。文件替换和符号链接有回归测试，原生激活 API 最终按路径打开，其与文件系统检查之间仍有非原子窗口。候选包在本地使用简化的模糊匹配，支持原生生成的拼音和首字母字段，排序行为仍需和现有 Launch 对照。

Snap Windows 调用仅以空对象传入固定入口，经 Bridge 的实时权限和 capability 检查后调度系统工具。原生服务同时由旧 Windows Snap 入口复用。

## 跨工具依赖

- 官方信任表没有发布者，公开 Web runtime 发布门禁仍关闭。分支里的官网和桌面市场目录有五条工具信息，只有已签名且通过设备验收的归档才能添加到可安装列表。
- Standard 仍走四个静态模块。共用市场包的预装种子、保留卸载意图、旧 Registry 迁移、更新 ready 失败回滚和故障恢复仍是独立工作。
- Snap macOS 的编辑器与宿主的专用窗口、原始二进制 IPC 和剪贴板耦合。迁移边界是包负责编辑，宿主负责截图屏幕与像素预算、单一所有者和 PNG 原始通道。捕获与钉图窗口需要可随插件停用撤销的会话。
- File 当前引擎通过同一个 `zero.file` Registry 记录的第一方引擎元数据发放租约，Webview UI 使用同一 canonical ID。实现独立 UI 时需要令引擎的批准身份、版本和资源句柄独立于 UI 包版本，再让每个作业持有已核验的引擎租约。仅迁移 React 页面会缺失文件授权和作业生命周期。[File 引擎规范与策略](../../../../docs/plugins/zero-file-offline-engines.md)

## 本轮验证

- 根前端 789 项，全功能 Rust 674 项通过、3 项原有忽略。本次 Rust 回归中的 Vision 双语边缘和空白合成图测试通过。Core 定向 Rust 另验证 27 项协议/权限/会话与 10 项应用发现/文件身份。
- full、core、standard 的前端构建和体积预算通过。Core 实际构建为 415,775 字节，0 个工具、0 个具体工具模块。Rust fmt、全功能 all-targets 检查和 OpenSpec 47 项严格验证通过。
- 两包通过 JSON schema 和归档检查。重复构建以及在仅有独立工具源码、SDK 和精确锁版本依赖的临时目录内构建，均生成相同字节。离线安装缺 React tarball，隔离测试使用已安装的锁定依赖副本。Snap Windows 系统调用模块在独立小 crate 中通过 x64 MSVC 目标类型检查。
- Launch macOS 源码冒烟在独立临时 Registry 安装 `example.launch`，验证真实应用目录进入独立 WebView、关窗重开加载、停用撤销会话。首次受限启动无法连接 WindowServer 相关服务，退出后在允许访问原生服务的环境重跑通过。追加冒烟通过 Launch 界面搜索并打开 macOS 系统计算器，确认打开成功后写入使用记录。真实全局按键及完整用户安装生命周期仍待设备验收。
- 本地 QA 应用位于 `src-tauri/target/debug/bundle/macos/Zero Launch QA.app`。版本 0.2.0，标识 `com.watson.zero.launch-qa`，数据目录 `/private/tmp/zero-launch-qa-data.V8RpFg`。本地 ad-hoc 签名校验通过，可执行文件 SHA-256 为 `d4738b9b9bc59473bd71c649de5cb64d57942a5913179813bb2ea6b911052d11`。可从扩展管理导入 `build/core-market/qa/example.launch-0.1.0.zplugin`，其 SHA-256 是 `105f82459c8f08a5582f9d1da00b5d96b53e34a9d796dbd6109c0b42626b3eb8`。既往 Paper / Awake QA 继续用原本的应用和数据目录。

原始运行日志与构建报告位于工作树 `build/core-market/evidence/2026-11-19/launch-snap-packages/`。
