## 1. 实施基线、依赖和验收语料

- [x] 1.1 重读当前工作树、Snap/File/Awake/导航/性能活跃变更和主规范，记录本变更的定向替代关系；通过交付 scoped baseline 记录验证未改其它 change 的历史 evidence 或手工勾选。
- [x] 1.2 锁定 objc2-vision 最小 feature 与兼容版本，核对 Apple 语言/revision、许可和部署目标；交付依赖记录及 macOS 最小真实 provider 探测，Windows/Linux 明确 capability unavailable。
- [x] 1.3 扩展现有合成 generator：中英文图片、上下边缘文本、低清/无文字、单栏扫描/文字扫描混合 PDF、普通/扫描空白页、两栏和表格文本；通过稳定 expected manifest 与生成检查证明没有用户截图或私有文档。

## 2. Capture 单会话与显示器一致性

- [x] 2.1 提取 authoritative capture lifecycle/generation 模型，合并 preparing/reveal 中的重复请求、editing 重聚焦；通过并发 menu/shortcut/main 测试验证只保留一会话且不改已有 intent/display。
- [ ] 2.2 增加 closing/Destroyed 注册释放确认、单个待启动请求和有界失败反馈；测试立即重启、销毁失败/超时、旧 callback/timeout 晚到，证明无 duplicate label、不关闭新会话、不阻塞 AppKit 主线程。
- [x] 2.3 增加 Rust/TS 对称 CaptureDisplaySnapshot，入口解析 glyph/cursor display 并回退 primary；用左右/上下/负原点/无效 geometry 模型测试及序列化测试验证单位与字段。
- [ ] 2.4 将指定 display 捕获、native overlay 和 window candidate enumeration 统一到该快照，保留 hidden prepare/decode/commit/reveal；用 1x/2x 图像/viewport 变换测试及首帧回归证明 source crop 一致且没有非目标屏副产物。
- [ ] 2.5 处理 permission、hotplug、media/reveal 失败、过期和插件停用清理；通过 failure injection 验证会话/lease/token 失效、owned media 回收和可用 shell 恢复。

## 3. Snap 原生菜单与手掌拖动

- [x] 3.1 在 host 菜单模型新增 typed Screenshot/OCR 动作，左/右键统一原生 popup；通过模型/dispatch 测试确认精确 cell、separator、应用退出语义、当前 accelerator 和 OCR 禁用状态，Awake/Ø/相邻工具不变。
- [ ] 3.2 协调 menu dismissal、capture handoff 与局部 highlight 清理，接入双语宿主错误；测试取消、失败、快速点击和动作 exactly-once，冻结截图不能包含菜单。
- [x] 3.3 迁移废弃 snap-menu WebView 路由/CSS/capability/blur/tool-window-map 调用与兼容 command；通过路由、调用者及边界检查证明无失效 surface 或权限扩大，直接快捷键与 Windows launcher 保留。
- [x] 3.4 提取选区 interior hit-test/translation/clamp 模型，定义 handle/annotation/interior/outside 优先级；测试 1x/2x 映射、四边 clamp/反向回拖/满轴、宽高/radius 不变及标注源坐标/history 不变。
- [ ] 3.5 接入 grab/grabbing、pointer capture、live draft 与 Escape/cancel/lost capture rollback；通过交互测试验证内部平移、外部重画、resize、标注工具、键盘 nudge、export 裁剪与 toolbar 同步。

## 4. 宿主共享离线 OCR

- [x] 4.1 建立独立 services/ocr provider、能力/line/page/error 对称契约和 composition；运行 Rust 序列化/TS 编译/插件边界测试，确认 core 无具体插件导入、插件无 peer import、无任意路径 OCR 命令。
- [x] 4.2 实现 macOS Vision accurate adapter 和实际 supported language probe，统一 top-left pixel bounds/confidence；用真实合成中英文图片验证文字、上/下缘坐标与空结果，unsupported language/OS 返回明确错误。
- [x] 4.3 实现单 worker、两项等待、Snap/File 公平调度及入队开始的 deadline；测试竞争、busy、parent deadline、取消/晚到结果和 native worker 未结束时 slot 仍占用，证明资源不随重复请求增长。
- [x] 4.4 校验 PNG header/bytes/pixel/edge、line/text 上限和 provider result，管理 bitmap/临时资源；通过畸形数据、超量维度/结果及故障注入测试确认有界 decode 与清理。
- [ ] 4.5 接入安全诊断与 stop/exit 撤销，明确 snapshot TTL；通过 canary 文本/token 的日志隐私测试和 dispose 测试证明无内容持久化或过期权限。

## 5. Snap 截图 OCR 闭环

- [x] 5.1 新增独立 typed OCR capture intent、菜单/main/editor 动作及“识别选区原始文字”双语提示；测试不被 normalize action 回退 copy、无选区禁用及 provider unavailable 指导。
- [ ] 5.2 实现 active capture 限定的 session+rect OCR command，Rust 裁剪原图、创建 job 并完成 overlay teardown/main handoff；测试越界/NaN/过期/错误 caller 和带标注选区，证明只识别原始 crop 并释放 full media。
- [ ] 5.3 实现 main 限定的最新 job snapshot/read/cancel/clear 与无正文失效通知；测试 revision、StrictMode 重挂载、晚到旧响应、切工具、close/reopen、TTL、插件 stop，证明结果不会跨任务覆盖或泄露。
- [ ] 5.4 在 Snap main 接入独立 hook/service 的 loading/result/editor/empty/error/cancel/new-capture UI，显式 Copy 由 Rust 写文本剪贴板；交互测试及双语 keyboard 检查验证复制的是编辑后文字且失败不会伪报成功。

## 6. Zero File 扫描 PDF 联动

- [x] 6.1 为 File engine 新增 run/page/engine-version/deadline 范围 OCR lease 与 raw PNG upload bridge；用真实 IPC/序列化和 caller/replay/cross-job/方向/页范围/尺寸/过期测试证明 File engine 不获得截图或通用文件权限。
- [x] 6.2 扩展页面分类，保留稀疏文字直接提取、空白页分页与同页插图限制，对无文字非空扫描页启用 OCR；用合成分类测试覆盖 image-backed blank、扫描、混合文档、损坏文字和现有旋转限制。
- [ ] 6.3 为 converter 注入 recognizePage，逐页有界 raster/下采样及 pixel→PDF point adapter；用 cropBox/坐标、低置信、预算、取消/timeout 测试验证正文映射、warning 和页资源回收。
- [x] 6.4 将 OCR 文本接现有阅读顺序/段落/docx writer，避免整页背景图/隐藏文本与重复提取；运行实际合成 PDF→DOCX 转换，解包检查预期正文、页序、分页、结构 warning 与非图片-only 输出。
- [ ] 6.5 补齐无 provider/language 的 ocrRequired 映射、OCR失败/无文字/资源上限/取消/超时类别及 recognizing progress；用队列 failure injection 和 Rust 输出验证证明关键页失败无最终 DOCX且后续 job 可运行。
- [x] 6.6 递增 File run 协议/候选引擎版本，双门禁查询 engine ready 与 host OCR，接入双语转换前说明/ocrUsed/校对/版式 warning；运行 readiness、旧版本拒绝、i18n 与 packaging contract 检查，candidate 继续未批准。

## 7. 综合检查与真实设备证据

- [x] 7.1 顺序运行测试准备及 pnpm test、pnpm build、cargo fmt --manifest-path src-tauri/Cargo.toml --check、cargo check/test --manifest-path src-tauri/Cargo.toml --locked；执行 node scripts/performance/build-graph.mjs --check --output /tmp/zero-snap-ocr-build-graph.json、openspec validate --all --strict 和 git diff --check，记录首轮真实结果及环境失败。
- [ ] 7.2 运行 pnpm tauri dev，在 macOS 实测 Snap 原生菜单与 Awake 外观/键盘/亮暗模式/高亮/外部点击、截图许可拒绝恢复及重复启动；交付脱敏证据，证明没有 duplicate capture label 或冻结菜单。
- [ ] 7.3 在真实左右双屏验证两屏 glyph/main/快捷键入口、立即取消重开、选区手掌拖动及 Copy/Save/Pin；另测上下/负原点/Retina+1x/hotplug，交付布局与结果矩阵，无设备布局保持未完成、不用纯模型替代。
- [ ] 7.4 使用真实 macOS OCR provider 验证 Snap 中英文 crop/空结果/编辑复制/取消/主窗口关闭和 File 单栏扫描/混合/空白页；对 DOCX 在兼容编辑器实际修改、保存重开，记录文字覆盖/阅读顺序与误差，不只用 mock 或 ZIP 结构判通过。
- [ ] 7.5 独立记录 Windows launcher/普通文本转换/无 OCR capability 回归与设备结果；新精确签名 File 工件需验证离线 ready/转换/旧版本拒绝、资源/取消及内容隐私，无设备/工件证据保持对应门禁未完成，不批准 engine policy。
- [x] 7.6 更新当前项目地图、File 引擎指南和本 change 验收记录，注明首期 macOS OCR、单屏会话、真实表格/同页局部扫描限制与未来规范依赖；核对未改历史 evidence、未纳入私有数据或 generated assets，保留未归档状态。
