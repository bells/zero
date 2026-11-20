# Launch、Snap、File 本地 QA

2026-11-20，在 `codex/core-market-install-experience` 基线 `13e75b2` 上继续 OpenSpec 4.5 和 4.6。使用独立标识 `com.watson.zero.tools-qa` 的 Apple Silicon macOS Core 0.2.0 调试应用。工作区的 `build/core-market/qa/tools-2026-11-20/` 保存应用、待导入的三个包、隔离数据和验证日志。应用初次启动无预装工具。

## 本轮可体验范围

| 工具 | QA 操作 |
| --- | --- |
| Launch | 搜索并打开已索引的本机应用 |
| Snap | 截取 macOS 主显示器，在包内裁剪、标注、移动标注、撤销或重做，复制或保存 PNG，切换当前编辑窗口置顶 |
| File | 从原生对话框选择 PDF 或 DOCX，选择另存位置，转换为 DOCX 或 PDF，查看进度、取消或在 Finder 中定位完成的输出 |

Snap 逐会话绑定原图、PNG 导出租约和当前视图，沿用宿主窗口生命周期协调层。独立包负责画布交互，宿主负责屏幕权限、像素和字节限额、二进制校验、剪贴板和保存。Windows 延续系统截图入口。

File QA 通过 Rust 选择文件并持有授权，转换前复制到受控工作区，沿用隔离引擎、输出格式验证和原子发布。独立 UI 包只含界面和工作流。引擎资源随 QA 宿主嵌入，正式引擎的批准表与签名策略保留原规则。File 的 capability 仅向符合配置的 macOS Debug Core 提供。

三个包统一为 0.1.0。开发归档使用 `example.launch`、`example.snap`、`example.file` 标识，可通过扩展管理导入。每个开发包的非 manifest 文件与同轮正式标识归档逐项相同。候选包核验、哈希和工具链日志位于 QA 目录的 `evidence/`。正式发布需要另外完成签名、运行时和设备验收。

## 验证和剩余验收

- 以空的临时注册表安装三个开发包，通过原生 WebView 验证三个界面渲染。[冒烟程序](../../../../src-tauri/examples/tools_package_smoke.rs)
- 用同一套嵌入引擎资源转换仓库样例 PDF 与 DOCX，两种方向的输出均通过现有格式校验。首次试跑使用开发 URL，未能加载内嵌引擎。开启 Tauri 本地资源协议后通过。
- 全量前端回归 806 项通过。首轮发现 Snap 窗口隐藏/恢复未经过宿主协调层，修复后四项定向回归和全量通过。Full 与 Core 构建、体积预算和 OpenSpec 47 项严格检查通过。三个归档的重复构建字节一致。
- QA 配置的 Rust 定向组共 398 项通过、1 项忽略。全功能 Rust 回归 680 项通过、3 项忽略。新覆盖会话二进制租约、PNG 与文件身份、转换目标和授权失效。
- 维护者实际抓屏授权、完整 Snap 编辑和导出手势、File 原生选择/保存对话框与取消、Windows 设备、独立更新和正式上架均待验收。Snap 的独立钉图窗口和 OCR 仍待迁移。OpenSpec 的平台功能验收任务仍为开放。

跨端方法与返回类型见 [SDK 契约](../../../../src/sdk/README.md)。QA 版使用本地 ad-hoc 签名。
