## Why

Zero 官网已有开发类和图片类工具，但缺少可直接写作、查看排版并下载成文档的 Markdown 工具。新增浏览器本地编辑器，让用户无需注册即可完成单篇笔记、README 和技术文档，并直接下载 Markdown、HTML 与可搜索文字的 PDF。

## What Changes

- 新增「文本类 / Text」（`text`）与 `markdown` 工具；提供 `/tools/markdown/`、`/en/tools/markdown/`，兼容站点 base。现有七工具、开发/图片分类及桌面说明 URL 保持原归属。
- 提供源码、预览、分屏三种模式；桌面默认分屏，窄屏默认源码并可切换预览；沿用官网深浅主题，支持工作区全屏。
- 支持常用 Markdown、GFM 表格、任务列表、删除线、代码高亮，以及格式工具栏、撤销/重做、查找替换、快捷键、字数、标题目录和可关闭的双栏滚动同步。
- 支持粘贴及打开 UTF-8 `.md` / `.markdown` / `.txt`；主动复制源码、直接下载 `.md`、带内嵌样式的独立 `.html` 和浏览器本地生成的 `.pdf`。打印是独立补充操作，不能代替 PDF 下载。
- PDF 默认 A4 纵向、浅色正文、自动分页，要求中英文文字可选择/搜索；将中文字体、跨页表格、长代码块、链接和长文资源限制纳入验收。
- 内容默认仅在页面内存处理；提供默认关闭的单篇本地草稿开关和明确删除入口。外部图片默认占位，经本篇文档授权后才请求；原始 HTML 不直接执行。
- 更新双语目录、分类内/全工具搜索、共享指南、SEO/AI 索引与可选反馈线程，同时保持反馈默认关闭和点击后异源加载的既有约束。

## Capabilities

### New Capabilities

- `web-markdown-editor`: 单篇文档编辑、实时预览、GFM、编辑辅助、文件导入及响应式工作区。
- `web-markdown-export`: Markdown/HTML/PDF 直接下载、独立打印、文字型 PDF 排版和可恢复的导出任务。
- `web-markdown-privacy`: 默认临时内容、主动开启的本地草稿、不执行原始 HTML、外部图片授权及内容隔离。
- `web-markdown-discovery`: 文本分类、双语工具路由、八工具发现与搜索、静态指南和独立反馈标识。

### Modified Capabilities

无。当前主规范仅有桌面 shell 与 caffeine duration；网站规范仍位于未归档变更中。本增量以新能力明确 Markdown 的局部扩展，不改写其他变更或主规范。

## Impact

- 仅影响独立 Astro `website/` 的 content、webTools 组件、浏览器 scripts、纯 TS 规则、测试、构建资源，以及必要的反馈线程 allowlist。不新增 Tauri command、Rust/TS IPC、桌面插件或服务端文档转换接口。
- 复用已有 CodeMirror 基础包；评估 Markdown/GFM 解析、清洗、高亮和 PDF 开源库，以及可嵌入的中文字体。精确版本、实际分发许可、Worker/CSP/base 适配与字体体积须在实施前固定并验证。
- 后续生成约 36 个可索引页面、38 个 HTML（当前 34/36 的基线上新增双语两页；以实际路由审计为准）；同步目录、全工具搜索和发现断言中的旧数量。
- 衔接 `usezero-web-tools-extension` 的临时内容/静态交付规则、`extend-web-tools-batch-and-diff` 的发现规则、`add-web-image-tools-and-categories` 的分类规则，以及 `add-web-tools-feedback` 的隔离规则。Markdown 草稿和主动图片请求是明确且有限的新增例外，其他工具不获得这些权限；未来同步须按依赖顺序协调旧枚举/数量/隐私措辞。
- 本次交付仅为提案、设计、规格和未执行任务；实现、安装依赖、提交、推送、部署、规范同步与归档不属于本次操作。
