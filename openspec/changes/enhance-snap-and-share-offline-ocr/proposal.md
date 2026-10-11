## Why

Zero Snap 的单项绿色卡片与 Awake 原生右键菜单不一致，选区内部不能直观拖动，双屏使用还出现 `a webview with label capture already exists`。新增截图 OCR 时应同时服务 Zero File：其当前无文字层扫描页返回 `ocrRequired`，共享离线识别能力能补上扫描 PDF → 可编辑 DOCX 的文字来源。

## What Changes

- **BREAKING（菜单交互）**：macOS Snap glyph 的左键菜单改为与 Awake 右键同一原生菜单技术与系统样式，展示“截图”“截图 OCR”、分隔线及明确的应用退出项；右键提供相同 Snap 动作。保留全局截图快捷键、主窗口及 Windows 系统截图入口。移除 macOS 卡片式 `snap-menu` 展示路径，失败通过本地化宿主反馈呈现。
- 新增 Snap 截图 OCR 菜单入口、主窗口动作及编辑器 OCR 按钮；复用截图选区，离线识别后在 main 的 Snap 内容中查看、编辑、复制文字，不自动覆盖剪贴板、不保留 OCR 历史。
- 选择工具下，选区内部无标注处显示 `grab`，拖动时显示 `grabbing`；整体平移选区、保持尺寸，保留边角缩放、标注选择、键盘移动和选区外重画。
- 修复截图单会话重入、异步销毁和陈旧回调；目标显示器由点击 glyph 所在屏或直接入口的鼠标所在屏确定，同一显示器快照贯穿捕获、窗口、候选和像素换算。首期每次选择一块完整显示器，不拼接跨屏选区。
- 增加 Rust 宿主离线 OCR 服务，Snap 和 File 通过各自受限 adapter 共用 provider、结构化文本块、资源限制及取消机制，插件之间不互相导入。macOS 首期使用 Apple Vision，经语言和系统能力探测后开放；Windows/Linux 无可用 provider 时明确不可用。
- **纳入 File 联动实施**：在内置 PDF → DOCX 中对非空扫描页执行逐页 OCR，将文本块接入现有段落/阅读顺序/`docx` writer；混合 PDF 保留原文本层，处理扫描页，失败不输出缺页或整页图片 DOCX。OCR 不可用时保留 `ocrRequired`。不对普通插图默认执行 OCR。
- 完整 PDF 转 Word 还需要版面、表格、样式恢复；本次承诺支持语料的可编辑文字与明确版式警告，不承诺 WPS 等价精度、真实 Word 表格、公式、手写识别、翻译、录屏或批量图片 OCR。

## Capabilities

### New Capabilities

- `snap-native-action-menu`: Snap 使用 Awake 一致的原生菜单、双语动作、准确快捷键和错误反馈。
- `snap-selection-drag`: 选区手掌光标及整体拖动，定义命中优先级、边界和取消。
- `snap-capture-session-display`: 单会话窗口生命周期、显示器定位及多屏像素一致性。
- `offline-ocr-service`: 宿主共享离线 OCR、provider 能力、文本块、调用者范围和资源生命周期。
- `snap-screenshot-ocr`: 截图/选区识别、结果查看编辑复制、重试取消和隐私。
- `file-scanned-pdf-ocr`: 共享 OCR 接入扫描/混合 PDF → 可编辑 DOCX，逐页处理、输出验证和能力反馈。

### Modified Capabilities

无。主规范目前只有 `main-window-shell` 与 `caffeine-duration`；相关 Snap/File 能力仍在未归档变更 delta 中，上述路径为本次新增规范，不假定旧能力已同步。

## Impact

- Snap：`src/plugins/screenshot/`、`services/screenshot.rs`、`services/screenshot/capture_targets.rs`、`commands/screenshot.rs`；状态栏与共享窗口协调由 host 负责，保留按工具 ID 的菜单高亮。
- 共享 OCR：新增 `src-tauri/src/services/ocr/`，通过 `bundled_plugins.rs` / `lib.rs` 组合；macOS 复用既有 `objc2` 生态，评估 `objc2-vision` 的锁定版本、许可和最小 feature。不引入 Python/Qt、不要求安装 Umi-OCR、不启动通用 HTTP OCR 服务。
- File：逐页分类/render/中间模型/`docx` writer、isolated engine bridge、租约与结果验证；只增加 File job 范围的 OCR bridge，不扩大 File engine 通用文件/截图权限。候选引擎版本及协议兼容须更新，审批继续绑定精确签名工件。
- 重叠关系：定向替代 `optimize-zero-snap` 的卡片菜单及选区内部重画行为；补充 `enhance-zero-snap-smart-selection` 的首帧/显示器门禁；遵守 `systematic-performance-and-code-optimization` 的 raw IPC/token/lease；扩展 `refine-zero-file-editable-conversion` 的扫描错误为“无 provider 时失败，有合格 provider 时逐页 OCR”。导航、Awake 与诊断变更继续独立，不改旧 evidence 或任务勾选。
- 验证：纯模型/IPC/原生生命周期测试、合成中英文截图和 PDF 实际转换输出、macOS 原生菜单/双屏/剪贴板/编辑器 smoke 分列；Windows、离线签名包、发布批准均为独立门禁。本轮仅规划，无运行时代码、提交、归档或包批准。
