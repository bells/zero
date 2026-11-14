## Context

日期：2026-11-14。维护者选择 core 保留共享原生能力，工具界面、业务逻辑和大型资源通过市场按需下载，并明确要求各插件独立。动机见 [proposal](proposal.md)。

当前 `scripts/build-profile.mjs` 的 core 排除 `bundled-tools`/`file-tool`；`services/mod.rs` 连同原生服务一起裁剪，`bundledPluginCatalog.core.ts` 为空。`.zplugin` 安装/摘要/权限/registry 已有基础，但正式 Web runtime 关闭，隔离运行时的 network 方法仍返回 unavailable，五工具依赖静态 loaders 和私有 typed invoke。不能将现在的五个目录压缩后直接放进市场。

本设计扩展既有 `add-plugin-extension-api`、`standardize-zero-plugin-protocol`、`package-zero-trial-profiles`。保留独立 WebView 承载插件内容的既定方案，不用 iframe 或把动态脚本导入 main/tray；现有平台 conformance、File 引擎批准和设备任务不因此完成。

## Goals / Non-Goals

**Goals:**

- core 是普通用户的无工具安装入口；一个工具包安装后能在受支持平台完成其真实功能，无需更换为 standard。
- 五工具分别能构建、测试、发布、安装、更新、停用和卸载；更改某插件不要求重新构建其他插件，也不要求在宿主写插件 ID 分支。
- standard 预装与市场完全相同的四个包；native API、版本检查、权限和运行隔离一致。
- 未安装工具没有快捷键、托盘项、索引、计划任务或工具 WebView；使用完毕或停用后按资源所有者清理。
- 保持业务行为、原生平台差异与私有数据兼容，特别是 Snap raw media/lease、Awake 隐藏窗口继续运行、Launch indexed-ID 与 File 引擎签名策略。

**Non-Goals:**

- 本轮不采用 Rust 动态库、不增加任意 binary/script 安装执行权限，不发布未经设备验证的第三方 API。
- 不要求 core 完全不含原生代码，不承诺当前纯空壳体积，也不把工具全部改成前端系统调用。
- 不把 Python/LibreOffice/Word 等外部程序静默安装成依赖，不放宽 File 签名审批，不声明 Linux/mobile 对齐。
- 本提案不授权上传资产、公开发布、替换安装器、生成/存储发布私钥或归档已有变更。

## Decisions

### 1. Approaches and selected scope

| 方案 | 特点与代价 | 决定 |
| --- | --- | --- |
| core 提供原生 API，工具独立 Web 包 | 复用 Tauri/Rust 与当前隔离运行时；插件界面与业务独立更新；新增原生 API 仍需宿主升级，core 大于当前空壳 | 维护者已选择 |
| 每个工具携带独立原生进程 | 能按需分发原生代码；需新增持久双向进程协议、平台/架构产物、签名和进程生命周期，现有 legacy executor 不能直接承担 | 本轮不选 |
| 保持 standard 静态工具，只补市场入口 | 改动小，但不能满足 core 按需安装工具 | 排除 |

这是跨宿主、SDK、五插件与发行流水线的完整项目，按阶段验证，不以补一个 JSON 或打开一个 runtime 常量作为完成。

### 2. 独立性按所有权定义

| 所有者 | 拥有内容 | 不得拥有内容 |
| --- | --- | --- |
| 每个工具 `src/plugins/<tool>/` | 清单、React UI、领域规则/默认值/工作流、配置 schema/迁移、翻译、图标、资源声明、独立构建入口和测试 | 其他插件实现、宿主内部路径、无授权系统访问 |
| SDK / 宿主契约 | 稳定方法 DTO、能力查询、事件、错误码、取消/租约与注册协议 | 工具页面、工具业务默认值、以五个 ID 硬编码的路由 |
| Rust providers | 操作系统调用、权限、队列与权威任务状态、资源限额、持久执行、租约回收 | 市场卡片、插件 UI、靠具体插件名称决定通用方法行为 |
| 应用/构建组合层 | 静态注入 provider、打包配置、预装包清单、公共发布者信任配置 | 复制插件业务实现、赋予包任意 Rust 执行权 |

插件仅通过公开 SDK 依赖宿主能力，不通过 npm alias 绕回 `src/core` 或直接 `@tauri-apps/api`。契约仓库内复用，构建包必须可在仅有本插件源码、SDK 和锁定依赖时生成。禁止插件间源码/二进制依赖；通用库可以成为显式、版本化依赖，不隐式依赖安装了另一个 Zero 工具。

领域策略与权威执行分开：例如 Awake 拥有计划交互、规则与配置迁移，Rust 的通用持久任务/电源租约按经校验的任务描述执行并协调取消；不把后台计时放进可能被销毁的 WebView。现有工具专属 Rust 算法必须逐项归类：系统/权威执行逻辑归受控 provider，纯领域规则迁回插件；不得只换目录名称就宣称完成解耦。

### 3. Providers 与插件包分别版本化

core 编译共享 provider 的实现，按调用惰性初始化；没有工具时仅保留宿主所需基础设施。provider API 按能力与版本声明，插件 manifest 除 host/API/platform 外声明 `requiredCapabilities`，元素为稳定能力 ID 与 SemVer 范围。Rust compatibility 是最终判断方，TS 类型逐项对称。

能力按捕获/媒体、clipboard、power lease、受控 network、插件文件、wallpaper、app index/activation、窗口/快捷键/托盘贡献、engine lease 等系统职责划分。实现前为每个方法写明 permission、参数/返回 DTO、错误码、资源 owner、deadline 与取消语义；优先复用现有受测原生服务。

宿主没有所需能力或版本不足时，市场显示不兼容原因与宿主升级要求，不执行插件，也不以安装成功代替功能可用。已有 0.1.0 包仍按真实能力拒绝新工具包；首发宿主版本在兼容测试前统一确定，不假称旧版能自动补入编译能力。

SDK -> 会话绑定 Bridge -> Rust permission/provider；不增加插件直达 private invoke 的例外。原生资源按插件 ID + 包摘要 + generation + lease 绑定。后台 lease 可以跨工具窗口关闭继续存在，但停用/卸载必须按声明策略清理；关闭 UI 不等于停用插件。

#### 无可见界面时的插件业务执行

以下是本设计补充的技术选择，尚待随设计整体确认：共享调度器只保存经校验的时间/唤醒条件、taskId、插件/摘要/generation、声明事件 ID 与有界 payload，不拥有 Paper 每日选图等业务。插件 manifest 声明独立 `background` JS 入口与可接收事件；入口只依赖 SDK，不挂载工具 UI。

到期或已批准的宿主事件触发时，宿主按需创建同等隔离的隐藏 WebView 会话，执行包自己的后台入口。事件的失败/取消、会话 ready、执行时限和重复提交按任务 ID + occurrence ID 协调；一个插件同一后台事件不重入，错过多次时按声明的合并策略执行最近一次，不无限补跑。任务调度/发生记录持久化，进程崩溃后重投递只携同一 occurrence ID；具有副作用的 provider 使用该 ID 拒绝重复提交，不能宣称任意外部网络操作 exactly-once。

后台会话仅有 manifest 与实时 grants 允许的 API，不调用显示窗口、交互对话框或新的权限审批；遇到需要用户参与的权限/兼容问题，记录待处理状态并通过宿主界面提示。执行有固定上限（初始 60s），未完成则取消/撤销会话并按 task 状态报告失败，不自动扩大常驻能力；有界下载和原生任务在 provider 上下文中按各自 lease 处理。

Paper 的定时选图/请求/缓存与应用工作流留在插件后台入口；Awake 的持续防休眠和已提交到期 lease 由 Rust 执行，复杂计划触发时再唤醒其插件入口。完成后销毁隐藏 WebView，无需常驻插件 JS。插件更新须撤销旧调度 generation，用户既有计划经该插件配置迁移后重新绑定；停用/卸载撤销其唤醒任务和会话，不影响其他插件。隐藏 WebView 同样必须通过 WKWebView/WebView2 原生 gate，未验证的平台不得发布依赖它的定时功能。

### 4. 包内容、构建与官方身份

每工具独立输出 `<id>-<version>.zplugin`，包含 v2 manifest、HTML/CSS/JS、翻译和小型静态资源。构建不将其他工具代码或大型可选引擎复制进来；独立打包脚本支持单插件选择，CI 针对包变更构建，不要求全工具同版本。复用现有 ZIP/JSON Schema/SemVer/摘要/权限/SDK 体系。

下载包不能凭 `zero.*` 名字、`source: bundled` 或自称 official 获得信任。官方 canonical ID 对应宿主发布者信任表：以既有 Ed25519 库校验官方包摘要签名，签名 payload 使用明确版本、固定字段与固定序列化，绑定 pluginId/version/SHA-256。签名放市场 entry 的版本化 envelope；离线导入官方包同时需要对应签名 sidecar，standard 的安装器携带相同 envelope。验证签名的公钥与授权 ID 范围随宿主分发，私钥只属于独立发布配置；摘要只证明完整性，不替代发布者验证。

签名证明发布者，不扩大 permissions；即使官方包也走会话、实时 grants 和 provider 限额。第三方不能覆盖 `zero.*`；不在本轮为其设计原生扩展。publisher envelope 与 File engine 的签名 payload/公钥/policy 完全独立。

### 5. core、standard、市场共用一个安装闭环

core 不带工具包，第一次打开显示“前往扩展市场”；市场无网络/空目录时说明实际状态。standard 随安装器附带 Snap、Awake、Paper、Launch 的同版 `.zplugin` 和签名材料，通过相同验证与事务安装；provenance 仅表明预装/市场/本地来源，不决定权限。source 字段的旧序列化值保持兼容，不为此强行统一 snake/camel case。

standard 的首次种子流程记录已处理的包集合与卸载意图，用户卸载后重启不会自动装回；显式“恢复预装工具”才从随应用包恢复，且不覆盖用户已安装的更新版本。从 core 切 standard 不自动覆盖用户选择，提供明确的安装推荐工具动作；相同 ID 只允许一个有效安装。full 开发配置可保留静态适配用于迁移比对，正式 core/standard 交付门禁不允许依赖它。

市场 entry 指向 GitHub Release 的实际产物，含确切版本、权限、SHA-256、签名与能力需求；仅列入通过该平台发布门禁的可安装组合，不添加虚假下载地址。不兼容项可展示原因，但禁用安装。包更新仍需独立显式请求，不实现自动静默更新。

安装/更新：有界下载与重定向检查 -> 摘要/官方身份/兼容/包结构校验 -> 用户权限差异审批 -> staging -> plugin operation gate -> 撤销旧会话与 drain -> 原子提交 -> 验证 ready -> 发布 revision。ready 失败恢复旧包、grants、enabled intent。任一失败不得改变其他插件；旧版保留到新包首次激活成功，防同版本不同摘要静默覆盖，降低版本需要明确操作而非市场刷新触发。

保留现有依赖的短锁与单写入约束；不在 registry 全局锁内网络下载、解压或执行 native hook。现有旧规范未完成的更新/回滚/命令激活任务是本项目依赖，不能绕过它们直接发布。

### 6. 五工具迁移分块、整体目标不缩水

| 工具包 | 需接入的 provider/贡献 | 必须保留的验收 |
| --- | --- | --- |
| Awake | power lease、持久调度/电源事件、托盘贡献 | 隐藏 UI 继续执行；停用释放防休眠；计划与电池保护无回归 |
| Paper | 受控 network、插件文件/cache、wallpaper、独立工具窗口 | 真实下载与应用、取消/超时、缓存上限、停用停止后台工作 |
| Launch | app index/watch、indexed activation、快捷键/工具窗口 | 无任意路径/命令执行；停用 watcher/快捷键清理；性能与搜索隐私 |
| Snap | capture/media/clipboard/OCR、capture/pin 窗口与资源租约 | macOS 编辑/导出/钉图真实可用；Windows 保持系统截图边界；raw media 不退回 Base64 大包 |
| File | engine provider/lease、文件授权、权威作业队列、签名资源安装 | 原有平台转换矩阵、取消/drain/回滚、引擎签名与批准、实际输出质量 |

先以 Awake 验证第一条 core -> 市场包 -> 真实原生能力闭环，再逐个迁移其他工具。File 的界面与业务包独立发布，但 OCR 模型/转换引擎等大型资产仍经既有签名引擎安装与审批，禁止打包任意 helper 来绕过。没有批准资产时 File 的发布项保持阻塞；阶段性四工具结果不标记“五工具全部市场化完成”。

### 7. 旧数据与静态记录迁移

保留 bundle ID、registry revision、`~/.zero`、旧工具数据目录、偏好 key、快捷键覆盖和五个 canonical ID。先保留旧记录的 enabled/disabled/uninstalled intent 与配置快照，再绑定已验证包；不凭市场刷新改变 enabled intent。

旧静态工具在新 core 缺少包时保留为迁移待安装状态，不伪装为 ready，不删除数据，也不自动启动旧静态代码。确认安装同 ID 正式包后恢复用户意图。standard 首次遇到旧卸载记录按旧 tombstone/已保存 registry 的缺席语义保留卸载；无法区分历史缺席原因时请求显式安装，不猜测恢复。

迁移与包提交使用可恢复事务记录/备份；失败回滚旧磁盘与内存快照。旧版宿主不承诺理解新字段/包；保留原始旧 registry 备份以供显式降级恢复，不让旧程序静默覆盖新安装权威状态。

## Risks / Trade-offs

- [core 体积与原生 API 耦合增加] -> 测量实际产物；插件/大型资源不进入 core，provider 惰性初始化；新 API 通过宿主版本演进。
- [把静态目录换成包名但仍调用私有 invoke] -> 单插件独立构建、SDK-only 边界、真实 core 安装验收、无 `zero.*` 宿主渲染分支共同验收。
- [大规模迁移行为退化] -> 一工具一迁移单元，旧适配仅作开发对照；保持清晰平台矩阵，严禁以全套编译通过替代功能。
- [卸载遗漏共享 native 任务] -> 以 lease owner/generation 做资源计数与隔离测试；一个插件停用不撤销其他插件资源。
- [官方身份与完整性混淆] -> 发布者签名与摘要同时校验，签名不等于权限授予；未配置可信签名资产不得上架官方 ID。
- [File 资产仍未批准] -> 保留真实阻塞与待办；本项目不通过修改 policy 解除阻塞。

## Migration Plan

1. 确认本设计，再形成逐步实施计划。先冻结包/能力/资源所有权 DTO 与共享正反 fixtures；保持正式 runtime gate 关闭。
2. 分离 provider 编译能力与预装工具目录；core provider 冒烟、空安装零工具资源；完成 session/贡献激活/更新事务所需基础闭环。
3. 发布目录生成与官方包签名校验先在本地合成产物测试；用独立 Awake 包做首个真机闭环，随后 Paper、Launch、Snap、File 分别迁移验收。
4. 新 core/standard 同包测试；验证旧 registry/偏好迁移、卸载不回种、更新回滚、离线恢复与 core/standard 互换。
5. 对明确支持的平台在真实安装器上验收。只在相应门禁通过后开放对应能力与包组合，确定首发宿主/API 兼容窗口并同步双语文档。
6. 准备可审查的本地包、签名材料契约、校验结果、市场 entry 与 Release 附件清单；上传/发布按单独授权执行。未发布前不宣称现有 0.1.0 已可用。

回滚时撤销新插件会话与资源，恢复上个已验证包和 registry 事务快照，保留用户数据。若关闭新 runtime，只标记不可用并给出诊断；不能重新打开私有 invoke 通路或自动抹除安装记录。
