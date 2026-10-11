## 1. 校准依赖与合成验收数据

- [x] 1.1 重读实时 File、状态栏、导航与引擎版本状态，复核 PDF.js/docx 上游文字、图像和 OOXML API/维护/许可；交付有来源日期的技术记录，注明 WPS 公开架构可参考的部分与未实测能力。
- [x] 1.2 扩展现有合成语料 generator/expected，覆盖单栏、短文本、英文空格、CJK、两栏、文字表格、嵌图、分页/空白页、全空白、扫描/混合、不可恢复顺序及密码输入；核对生成数据标记、稳定预期和原有 DOCX → PDF 语料不被误改。

## 2. 内置工具状态栏资格

- [x] 2.1 按 bundled source 和显式贡献归一化状态栏项，取消无声明内置工具的通用入口；用 Rust 测试证明 File/空贡献/旧 true 偏好均无入口，四个已声明工具及 installed 扩展兼容规则仍成立。
- [x] 2.2 回归资格变化后的 preview、fallback action、grouped cell/tooltip/highlight/click 数据；通过现有模型/契约测试证明无空槽、错位或陈旧目标，并确认 File 普通导航与搜索贡献保留。

## 3. 按窗口区分 File intake

- [x] 3.1 从宿主到 lazy panel/descriptor 传递 typed tray/main surface，上下文不增加 IPC 或 eager import；通过 TypeScript 构建和面板契约检查确认两处 surface 传递完整、其它插件兼容。
- [ ] 3.2 托盘使用选择按钮与中英文选择文案，主窗口保留拖入/选择与拖放监听；通过有意义的组件/集成验证检查文案、可访问名称、Enter/Space、busy 解除以及重复挂载监听清理。
- [ ] 3.3 回归原生 picker 的 DialogGuard 和空选择处理；测试取消不新增任务/报错，多选有效项进入待审队列，托盘关闭和主窗口重开不改变已有任务。

## 4. 可编辑文字重建

- [x] 4.1 抽离逐页内容分类与 typed 中间模型，区分短文本、空白、扫描和无法恢复的文字映射；通过合成用例验证 scan/mixed 为 ocrRequired、全空白/不可恢复为 unsupportedInput，普通空白页不会触发 OCR。
- [x] 4.2 实现词/行/段落重建、英文空格/CJK 连续文本、可靠的分栏顺序与表格文字重排；用带明确预期的纯逻辑测试验证文字完整性和顺序，复杂度不再选择图片 profile。
- [x] 4.3 用既有 docx writer 输出真实段落/runs、基本字体与分页及支持的独立图像；运行实际 PDF → DOCX 输出测试，解包核对正文全文/顺序、图片关系、分页与结构降级警告，不以源码字符串断言替代结果测试。
- [x] 4.4 移除整页图片自动回退，将生成错误、取消和超时沿现有生命周期传播；注入生成失败及取消，验证无图片 fallback、无最终文件、部分 staging 清理并允许后续队列继续。

## 5. 对称错误契约、语义校验与版本

- [x] 5.1 补齐 engine completion 的 ocrRequired/unsupportedInput 及 Rust/TS 对称校验，保留密码/取消/超时类别；通过序列化、completion 和队列集成测试证明 UI 收到正确错误而非泛化 providerFailed，诊断不含文档正文。
- [x] 5.2 在新内置 PDF provider 提交前增加有界 OOXML 正文语义校验；测试真实文字通过、图片/空正文/隐藏文字伪造失败，以及超量 ZIP/XML 拒绝，失败不触及现有输出或源文件。
- [x] 5.3 递增并统一引擎版本、资产 manifest 与候选配置，仅向兼容有效引擎广告 editableReconstruction；运行版本/包装/能力测试，验证旧引擎拒绝或要求升级、layoutPreserving 旧结果可读，候选仍未批准。
- [x] 5.4 更新转换前说明、结果警告及 OCR/unsupportedInput 中英文指导，移除不可用的图片模式建议；运行 i18n key 对齐和 File 状态测试，语言切换不重建任务或更改顺序。

## 6. 综合验证与原生验收

- [x] 6.1 顺序运行相关前端测试准备，再运行 pnpm test、pnpm build、cargo fmt --manifest-path src-tauri/Cargo.toml --check、cargo check/test --manifest-path src-tauri/Cargo.toml --locked；运行 node scripts/performance/build-graph.mjs --check --output /tmp/zero-file-build-graph.json、openspec validate --all --strict 和 git diff --check，记录真实结果及环境失败。
- [ ] 6.2 运行 pnpm tauri dev 并检查 macOS 原生状态栏图标/折叠/相邻点击、托盘 picker 多选/取消/外部失焦、main 拖放与共享队列；若使用 debug source fallback，记录 ZERO_FILE_ENGINE_DEV_ASSETS=1，明确它不是签名包证明。
- [ ] 6.3 在本机兼容编辑器中打开合成 PDF 转换结果，实际修改正文并保存重开，记录文字/分页/嵌图/复杂结构的结果；如已有可用 WPS，用相同合成文件对比并记录版本、平台和入口，无竞品环境则如实保留未实测说明。
- [ ] 6.4 在 Windows 设备验证 PDF → DOCX 编辑保存、扫描错误与单图标 fallback，另在精确签名候选包验证离线转换和旧版本拒绝；环境缺失则保持本项未完成并分列证据，不改审批策略或以 CI/macOS 代替。
- [x] 6.5 更新 File 引擎维护文档和本变更证据，注明旧 facsimile/fallback 语料与规格已被替代、未来同步的依赖顺序；核对未读写用户文档、未改历史证据/手工验收勾选、未提交生成资产，并保持变更未归档。

验收证据与未完成项的具体范围见 [verification.md](verification.md)。勾选表示该任务对应证据已完成；原生、竞品及签名包的部分结果不合并为完整通过。
