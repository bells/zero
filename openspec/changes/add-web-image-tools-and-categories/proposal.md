## Why

现有四个在线工具平铺展示，随着工具增加，查找成本会继续上升。用户还需要在电脑和 iPhone 浏览器中批量处理照片，包括文字水印、格式转换与压缩，并希望原始 HEIC 可以在本地处理而无需上传。

## What Changes

- 在线目录增加「全部 / 开发 / 图片」分类，默认全部；时间戳、JSON、Base64/URL、文本对比归开发类。目录搜索限定当前分类，既有全工具搜索仍覆盖所有在线工具；切换语言保留分类，既有 URL 保留。
- 增加双语图片水印、格式转换、压缩三个独立入口，共用批量文件队列、逐张预览、进度、取消、失败项重试、分别下载与成功结果 ZIP 下载。
- 三工具接受 JPEG、PNG、WebP、HEIC/HEIF 静态图片，导出 JPEG、PNG、WebP；HEIC 压缩通过转为 JPEG/WebP 实现。水印与转换页也提供输出格式、质量和可选最长边。
- 文字水印支持单处九宫格位置/边距及平铺模式，提供文字、字号、颜色、透明度、旋转、平铺间距；一批共享设置。
- JPEG/WebP 提供质量调节；PNG 保持格式时采用无损优化，不显示有损质量滑杆。展示真实输出体积和变化，无收益时明确提示并允许保留原图，不保证达到指定 KB。
- 默认保留尺寸、校正方向、去除 GPS/设备等元数据；透明图片转 JPEG 时明确填充背景，默认白色、可改色。PNG/WebP 保留透明能力。
- 继续使用浏览器本地、当前页临时处理；图片解码器/编码器按需加载，超限或不支持时明确报错，禁止静默缩图或上传兜底。覆盖电脑原始 HEIC 与 iPhone Safari 选图/保存两种场景，资源上限依据真实样本确定并公开。
- 将新工具纳入双语静态说明、搜索、SEO/AI 索引及既有点击加载反馈线程白名单；不传输图片、文件名、处理设置或工具内容。
- 首版不包含 GIF 动画、SVG、BMP、HEIC 输出、Logo 水印、上传字体、逐图排版、目标体积模式、跨页流水线；不承诺保留 Live Photo 动态部分、HDR、深度信息或多图容器。不涉及桌面插件、云端图片处理或部署。

## Capabilities

### New Capabilities

- `web-tool-categories`: 分类、分类内搜索、全工具搜索兼容、双语发现及新增图片反馈线程。
- `web-image-batch-processing`: 三工具共用的本地批量生命周期、资源约束、取消/重试、预览和下载。
- `web-image-watermark`: 批量文字水印的单处/平铺控制和一致的预览/导出。
- `web-image-conversion`: 静态格式输入输出、HEIC、方向、透明度与元数据处理契约。
- `web-image-compression`: JPEG/WebP 质量/尺寸控制、PNG 无损优化和真实收益反馈。

### Modified Capabilities

无主规范修改。主规范尚无官网能力；本变更通过上述增量能力衔接未归档的 `usezero-web-tools-extension`、`extend-web-tools-batch-and-diff` 和 `add-web-tools-feedback`。未来获准 sync/归档时，按官网基础 → 在线工具基础 → 批量/发现与反馈增量 → 本变更的依赖顺序协调，消除旧规范的三/四工具、28 页及旧图片上限的适用范围差异；不改写这些历史变更。

## Impact

- `website/`：工具清单/指南、Astro 页面与共享工具壳、目录搜索、样式、纯 TS 契约/任务管理、浏览器 Worker/Canvas/WASM 适配、下载、双语发现产物及相关测试；拟新增 `/tools/image-watermark/`、`/tools/image-converter/`、`/tools/image-compressor/` 和 `/en/` 对应页面。
- `feedback/shared/contracts.ts` 及服务相关验证：增加三个稳定工具线程，保留既有线程和审核/隔离规则；反馈启用/部署仍沿用原边界。
- 依赖优先评估 `heic-to`/libheif、jSquash 的 MozJPEG/WebP/oxipng 和维护中的 ZIP 库；实施前固定版本、审查实际分发物许可和构建兼容。仓库已存在 `image-meta`，`sharp` 不能直接作为浏览器编码器。许可证、源码分发/替换义务、WASM 资源和移动端内存是验证项，不是假定已通过的结论。
- 预期增加六个索引页面，按当前 28 页基线为 34 页；分类筛选不新增索引 URL。保留站点 base、canonical/hreflang、preview/error noindex 和原静态资源预算。
- 验收分别记录本地逻辑/浏览器自动化、真实照片/桌面 Safari/iPhone Safari、性能/资源和许可证据。当前仅提案，未安装依赖、验证解码器、实施功能、修改桌面 IPC、同步规范、归档、提交或部署。
