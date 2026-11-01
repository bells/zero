实施证据见 [implementation.md](evidence/implementation.md)。第 1–5 组勾选记录源码、确定性测试和合约审查；真实窗口／键盘／视觉／系统壁纸与设备行为仍由未勾选的 6.4、6.5 独立验收，不将其视为已通过。

## 1. 选择策略与日期规则

- [x] 1.1 为新打开会话的 latest-following／主动历史浏览建立纯 model，并用测试复现“缓存 10/28、远端 10/31 但旧图仍存在”的错误及刷新期间用户导航的竞态。
- [x] 1.2 定义并实现显示、切工具、隐藏重开与普通 focus 的会话边界，验证托盘、主窗口、专用 Paper surface 重开默认最新且可见会话刷新不打断历史选择。
- [x] 1.3 提取可注入时钟的中国市场日／候选图片日期／下一午夜 policy，验证 UTC 跨日、英文 UI、其他本地时区、无 displayDate、非法／未来日期及系统时钟前后跳。

## 2. 原生设置、安全状态与应用串行化

- [x] 2.1 添加版本化 Paper 设置／状态 store，默认自动关闭并兼容旧图片索引；用临时目录测试缺文件、旧缓存、损坏／未知版本、只读／写失败与未知文件保留。
- [x] 2.2 将现有手动应用与拟新增自动应用接入统一 async application queue，并以 fake setter 测试顺序、失败、重复 ID、并发请求及 OS 调用不占用 UI 线程。
- [x] 2.3 实现 pending intent 与最近成功应用持久化，验证保存失败不启动系统副作用、OS 成功但结果保存失败如实反馈、崩溃遗留 intent 阻止自动覆盖以及明确 off→on 的恢复路径。
- [x] 2.4 实现成功手动历史应用的中国当日保护、次日过期、跨重启恢复及明确 off→on 清除；用假时钟／store 测试浏览／下载／失败应用不建立保护，普通刷新不绕过保护。
- [x] 2.5 核查并保护当前系统壁纸文件的生命周期，验证十条图库滚动清理后当前壁纸引用仍有效、必要的受控 applied 副本有界且未知文件未被删除。

## 3. 每日检查与生命周期

- [x] 3.1 实现默认关闭的原生自动 runtime 与资格判断，测试开启立即尝试最新可用图、普通 daily check 只应用当日图、同 ID 去重、图片下载／校验失败不写成功记录。
- [x] 3.2 接入 Zero 启动补检查、中国市场日界和有界 reconciliation，验证无需打开 Paper、只补最新一次、6 小时常规检查、尚未发布 30 分钟后再检查和不产生休眠后补跑突发。
- [x] 3.3 实现 1／5／15／30 分钟有上限退避、事件合并与实际网络检查时间更新，以 fake clock／fetcher 验证持续断网、非 retryable 错误、手动强制检查和五分钟成功复用的区别。
- [x] 3.4 从现有平台 power adapter 抽取共享宿主订阅服务，接入 Paper resume 检查；测试订阅释放、注册失败降级和 Awake 原电源策略回归，确认 Paper 不依赖 Awake 启用状态。
- [x] 3.5 接入插件 enablement、开关和退出 generation，验证关闭／禁用后排队任务不应用、已开始 OS 调用如实报告、重新启用只启动一个任务且保留保护、隐藏图标不停止自动更新。
- [x] 3.6 检查 full／standard／core 的 Rust feature gates 和 frontend catalog，验证不含 Paper 的构建不启动其任务，不导入其设置 UI。

## 4. IPC、状态同步与插件设置

- [x] 4.1 定义对称 PaperSettings、PaperSettingsUpdate、PaperAutomationPhase 和 PaperRuntimeSnapshot，补 typed service 与薄 commands；用 serde／TS source-contract 测试 camelCase、枚举、可选字段、结构化错误和 invoke 参数。
- [x] 4.2 接入小型 revisioned 状态事件、活动视图失效重读和初始监听／snapshot 顺序，验证多 WebView 状态一致、旧 revision 不覆盖新结果、隐藏恢复重读且不依赖 UI 保活。
- [x] 4.3 校验新增命令的调用者与 capability 边界，验证授权宿主窗口正常使用，隔离插件／File engine 无新增权限，旧预览 token／raw bytes 合约不变。
- [x] 4.4 通过 Paper loadSettings 添加即时保存的每日开关、运行限制说明和详细状态；验证设置搜索／定位、成功保存但应用失败时开关保留、保存失败回滚、禁用／unsupported／损坏状态反馈及关闭入口。

## 5. 最新导航与状态反馈

- [x] 5.1 增加“回到最新”和“立即刷新”，验证前者仅改变预览意图、后者绕过成功复用并合并并发，两者不会开启自动或绕过当日手动保护。
- [x] 5.2 补齐真实图片日期、最近实际检查、未发布／旧缓存、更新中、应用结果和失败提示；验证成功 metadata 与桌面应用失败分别表达，不把旧图标成今天或缓存重放计作新检查。
- [x] 5.3 补齐中英文、键盘 focus／accessible name／状态播报和窄宽度布局，验证 tray／paper 快捷面板保持紧凑，主窗口设置展示详细信息且无横向溢出。
- [x] 5.4 验证隐藏／销毁／重开时请求 generation 和 Blob／preview token 清理，保留旧下载／保存／应用流程；测试迟到结果不能回写新会话或泄漏预览资源。

## 6. 集成检查与设备证据

- [x] 6.1 串行运行根 pnpm test、pnpm build，并在构建后运行 node scripts/performance/build-graph.mjs --check --output /tmp/zero-build-graph.json；记录结果且不覆盖 tracked 性能历史文件。
- [x] 6.2 运行 cargo fmt --manifest-path src-tauri/Cargo.toml --check、cargo check --manifest-path src-tauri/Cargo.toml --locked、cargo test --manifest-path src-tauri/Cargo.toml --locked；保留环境失败并按 AGENTS 的目标／串行策略调查，不能弱化测试。
- [x] 6.3 运行 openspec validate --all --strict、git diff --check 和本地链接检查，核对两个 capability 与任务对应，并记录旧 Paper delta 场景的后续整合顺序而不自动 sync／archive。
- [ ] 6.4 以 pnpm tauri dev 验证 macOS 原生 Paper 各入口、新打开选最新、历史浏览、默认关闭、开启立即应用、隐藏后台、唤醒、网络恢复和手动当日保护，记录实际桌面结果，禁止仅凭浏览器结果勾选。
- [ ] 6.5 单独在 Windows 设备验证 Paper 窗口／设置、实际壁纸切换、resume、插件启停和持久化；交叉编译／CI 不替代设备证据，设备不可用时此任务保持未完成并记录限制。
- [x] 6.6 更新相关产品说明和本变更实施证据，保持 README 中英文一致，并区分源码、自动检查、macOS／Windows 设备结果与未完成事项；不把 Linux／移动端或逐屏设置写成新增支持。
