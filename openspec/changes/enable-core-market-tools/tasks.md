## 1. 契约与独立包边界

- [x] 1.1 盘点五工具所有静态 UI/私有 invoke/原生后台依赖，产出逐项包、provider、契约归属表，并以源码路径和现有测试核对无遗漏。
- [ ] 1.2 定义 requiredCapabilities、background entry/event、官方签名 envelope 和 SDK 方法的 Rust/TS 对称 DTO；用共享正反 fixtures 验证 schema、范围、未知字段与错误诊断。
- [x] 1.3 将 SDK 作为可供单插件构建使用的版本化边界，验证仅插件源码/SDK/锁定依赖即可打包，不依赖宿主私有目录。
- [x] 1.4 增加独立包边界检查，验证插件间导入、private host import、直接 Tauri 调用、跨插件资源混入被拒绝；允许显式通用库依赖。

## 2. core 原生能力与生命周期基础

- [ ] 2.1 分离原生 provider 编译选择与预装工具目录，验证新 core 能查询能力但初装无工具窗口、索引、快捷键或工具后台任务。
- [ ] 2.2 建立 provider registry、版本报告与权限分派，验证缺能力/版本冲突/伪造身份/撤销 grants 均在副作用前失败，旧 0.1.0 core 不兼容新包。
- [ ] 2.3 将已需用的网络/插件文件/storage/窗口与贡献方法接入真实会话 Bridge，验证参数/响应限额、取消、重定向范围及无任意 private invoke 通路。
- [ ] 2.4 完成按声明贡献的激活/ready/deactivate 与 owner lease 清理，验证关闭 UI 不停止持久任务、停用撤销资源、late response 被拒绝且不影响其他插件。
- [ ] 2.5 实现通用持久调度与发生记录，验证重启恢复、时区/DST、missed occurrence 合并、单事件不重入和 generation 撤销；通用时间规则优先复用维护中的库或现有受测实现。
- [ ] 2.6 实现按需隔离后台入口，验证无可见窗口执行包业务、60s 上限、无交互审批、重复 occurrence 防提交、会话终态释放；分别记录 macOS/Windows 隐藏 WebView 原生结果。

## 3. 官方包与事务安装

- [x] 3.1 新增单工具确定性构建/打包入口，验证指定工具版本输出 manifest、UI、后台入口和资源，归档中没有 peer 工具或大型未声明资产。
- [x] 3.2 复用 Ed25519 实现官方包签名校验及 publisher/ID 绑定，用固定签名样例验证错误 ID、版本、摘要、公钥、篡改与缺 sidecar 均拒绝；不创建或打印真实私钥。
- [ ] 3.3 接入按权限差异审批、有界下载与 staging/短锁提交，验证下载中取消、超限、解压失败、同版本不同摘要和非官方覆盖保留现有安装。
- [ ] 3.4 完成 update drain、ready 失败回滚和崩溃恢复，验证包、grants、enabled intent、registry revision 一致且其他工具不受影响；交叉记录旧 protocol 待办的实际完成证据。
- [ ] 3.5 扩展市场能力与官方身份元数据展示，验证不兼容/未发布/离线/空市场真实提示，刷新不自动安装、降级或启用工具。

## 4. 五工具独立迁移

- [ ] 4.1 提取 Awake 所需 power lease/持久任务 provider，验证系统执行仍由 Rust 持有，计划领域配置由插件拥有，停用释放资源和电池保护行为不回归。
- [ ] 4.2 生成独立 Awake 包并通过 SDK 接入界面/后台入口，在 core 安装后验证真实防休眠、定时计划、隐藏 UI、卸载重装与配置保留。
- [ ] 4.3 生成独立 Paper 包并接入 network/cache/wallpaper/window provider，验证真实下载/应用、每日后台触发、取消、缓存边界与停用清理。
- [ ] 4.4 提取 Launch app index/activation provider 并生成独立包，验证仅 indexed-ID 激活、真实快捷键/查询/打开应用、watcher 清理与既有搜索性能/隐私规则。
- [ ] 4.5 提取 Snap capture/media/OCR/window provider 并生成独立包，验证 raw media/lease、编辑/复制/保存/钉图与资源清理；分别保留 macOS 与 Windows 系统截图流程证据。
- [ ] 4.6 提取 File engine/job/lease provider 并生成独立 UI/工作流包，验证真实平台转换/取消/drain/输出检查；未批准引擎必须明确阻塞而非放宽 policy。
- [ ] 4.7 验证每工具独立版本更新、卸载和后台终态资源计数，证明单工具操作不要求构建其他工具或修改宿主插件 ID 分支。

## 5. profile 与旧记录迁移

- [ ] 5.1 standard 通过同一安装事务预装同版四工具包和签名材料，验证 core 市场包与 standard 预装包 digest/权限/功能一致且没有额外来源特权。
- [ ] 5.2 实现预装种子与显式恢复意图，验证卸载后重启不回种、不覆盖更新版本、core 转 standard 不自动覆盖用户选择。
- [ ] 5.3 迁移旧静态记录为已验证包或待安装状态，验证五 ID、enabled/disabled/缺席 intent、旧工具数据、偏好与快捷键覆盖保留，不把无包记录标 ready。
- [ ] 5.4 为迁移和 profile 互换增加故障注入，验证中断/磁盘写入失败可恢复一致状态；保留原始 registry 备份以供显式旧宿主降级。
- [ ] 5.5 更新 full 开发对照与正式 core/standard 构建门禁，验证正式包不依赖静态工具 loaders、大型 File 资产或未安装工具启动工作。

## 6. 回归、设备与发行准备

- [ ] 6.1 串行执行根 fixture 准备与完整 pnpm test/build、Rust fmt/check/test --locked；保留首次失败，提供 scoped/serial 诊断与最终结果，不隐藏既有失败。
- [ ] 6.2 构建后运行 performance build-graph --check 并输出新证据路径，测量新 core/standard 体积与后台资源，验证没有 eager plugin UI 或空安装轮询退化。
- [ ] 6.3 在 macOS 真实新 core 安装器上完成市场安装/权限/五工具功能/独立更新/回滚/停用/卸载闭环，记录每个包摘要、版本、操作结果及 File 实际批准状态。
- [ ] 6.4 在 Windows 真实新 core 安装器/WebView2 完成对应闭环与支持矩阵，不能以 CI 编译替代 native 接受结果。
- [ ] 6.5 准备官方包签名的发布配置契约、每工具 CI/本地可复现产物、安装器、SHA256、能力矩阵、市场 entries 与 Release 附件清单；未授权前不上传或替换远程资产。
- [ ] 6.6 同步 README 中英文、PRODUCT、打包/插件开发文档和版本兼容声明；验证本地链接与严格 OpenSpec，并分别记录源码实现、真实设备和实际发布状态，不自动归档旧变更。
