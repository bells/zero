# Snap 入口、快捷键与 OCR 维护

本轮变更：[refine-snap-entry-shortcuts-and-startup](../openspec/changes/refine-snap-entry-shortcuts-and-startup/proposal.md)，用户已确认设计并授权实施。源码、自动检查、原生设备及分发验收分别记录，不代表当前下载页已经包含这些改动。

## 快捷键

- 截图默认 macOS `Option+A`、Windows `Alt+A`；截图 OCR 默认未分配。主窗口的“键盘快捷键”和 Zero Snap 设置编辑同一份 Rust 配置，支持录制、清除及恢复默认。
- 配置存放在 canonical `~/.zero/snap-shortcuts.v1.json`，没有历史自定义键位需要迁移；Launch 继续只读。替换键注册或持久化失败时保留原配置，并报告原生残留/恢复失败状态，不把失败写成已保存。
- Rust `set_snap_shortcut` 接收 camelCase `{ id: "snapCapture" | "snapOcr", accelerator: string | null }`，返回两项 Snap 与 Launch 的真实状态。React 使用 typed service/hook。原生菜单和 Snap 页从快照取提示，不另行维护硬编码键位。

## Windows x64 OCR

普通截图继续系统工具；OCR 独立冻结入口屏幕，快捷键用鼠标屏幕。原生采集验证 monitor handle、设备名、物理边界和 DPI，显示身份不依赖两次枚举的序号。选区只提供识别/取消，Enter 确认、Esc 取消。截图 raw-media 权限、会话代次、超时和清理继续由 Rust 控制。

本地识别使用锁定的 `paddle-ocr-rs 0.6.1`、CPU ONNX Runtime `1.22.0` 与 PP-OCRv4 中英文模型。Apple Vision 保持为 macOS 后端。ONNX telemetry 显式关闭，无运行时模型下载，不要求 Python、外部 OCR 程序或 Windows 语言包。识别结果回到现有 Snap 页，用户可编辑后手动复制。

[资源清单](../src-tauri/ocr-assets.json) 锁定下载归档和解包后文件的尺寸、SHA-256、来源及许可记录。14 个文件共 **29,454,481 bytes（约 28.1 MiB）**；这是原始资源尺寸，不是最终安装包或进程内存增量。包含模型/字典、ONNX CPU DLL、必要 app-local VC++ DLL 和许可记录；模型、推理库与 Microsoft Redistributable 各自保留来源/条款，不能据此宣称已取得所有分发审批。

开发者准备或离线复验：

```bash
node scripts/prepare-windows-ocr.mjs --download
node scripts/prepare-windows-ocr.mjs
```

构建时下载发生在开发/打包环境，运行时不下载。资源生成在 `node_modules/.cache/zero-windows-ocr/resources/`，不提交二进制。Windows Tauri 配置将其映射为安装后的 `windows-ocr/`；canonical `pnpm package:desktop --profile standard --target x86_64-pc-windows-msvc` 传递目标并准备资源，core 显式排除资源。缺失、篡改、symlink 或摘要不符会失败。受限网络可配合 Node 24 的 `--use-env-proxy` 及开发者自己的代理；缓存齐全后准备/验证可离线运行。

Windows 安装离线首用、中英实际识别、物理快捷键、显示热插拔及混合 DPI 需要 Windows 真机；交叉编译不能关闭这些任务。File 引擎的签名/批准清单保持独立，本轮不批准其工件。

## 启动性能与证据边界

启用 `ZERO_PERFORMANCE_TRACE=1 pnpm tauri dev` 后，固定阶段日志包含入口、菜单退场、targets、native capture、PNG write、WebView build、前端 media/decode、reveal 与 ready acknowledgment。诊断不包含窗口标题、截图、路径、token 或 OCR 正文。ready acknowledgment 是 UI 已提交、图像已解码及原生 show 返回的边界；实际可见首帧仍需设备观察。

macOS 窗口候选改为一次 CoreGraphics 快照，保留前后顺序、过滤和像素换算。原生 metadata-only 微基准（当前 3 个可见窗口，debug 构建）观察旧查询 **101,824 / 17,405 / 17,271 µs**，单次快照 **595 / 262 / 250 µs**。该结果证明此阶段的重复工作，不等于完整截图启动速度，更不能单独解释数秒延迟。

隐藏 WKWebView 在完成 JS/图像解码前无法请求显示，因此 capture 对支持该 API 的 macOS 关闭背景节流，避免 readiness 门禁与隐藏页面调度形成循环依赖。没有预先采集屏幕或缓存旧截图。首次与重复、菜单/快捷键/main、鼠标完全静止/移动、开发/优化构建的端到端数据分别保留。

本轮临时 `.app` 可验证原生设置录制、重置、重复键拒绝和默认显示；截图明确报屏幕录制权限未确认。这是验证应用身份的限制，不反证用户正常 `pnpm tauri dev` 的既有授权。未修改系统权限。菜单实际位置及静止鼠标 reveal 仍保留设备验收任务，详见 [实施记录](../openspec/changes/refine-snap-entry-shortcuts-and-startup/evidence/implementation.md)。
