## Why

官网目前以桌面产品介绍和安装说明为主，访客缺少可以立即使用并再次访问的入口。增加少量无需上传数据的在线工具，让访客先解决时间、JSON 和编码问题，再自然了解 Zero；搜索访问和桌面转化是待上线验证的目标，不承诺流量或排名。

## What Changes

- 新增中英双语在线工具目录 `/tools/`、`/en/tools/`，以及各自的 `timestamp/`、`json/`、`base64/` 三个工具页。保留既有 `/tools/{snap,launch,awake,paper,file}/` 桌面说明页及链接，清楚区分“在线使用”与“桌面工具说明”。
- 时间戳工具提供当前秒/毫秒时钟、暂停/继续、智能输入、显式单位兜底、北京时间/UTC/ISO 8601/相对时间及逐项复制，严格定义单位、时区与非法日期的处理。
- JSON 工具提供格式化、压缩、一次去除字符串转义、语法高亮/折叠、精确错误位置、复制与清空，并避免大整数或重复键在格式化中静默丢失。
- Base64/URL 工具支持 Unicode 文本、URL 组件编解码、本地 PNG/JPEG/WebP 与 Base64/Data URL 互转和预览；明确字节/尺寸限制和错误状态。
- 工具输入与结果只保留在当前页面内存；计算在浏览器本地完成，不上传、不记录历史、不写 URL 或遥测。首期不增加服务端计算、账号、PWA/整站离线缓存或桌面工具插件；不使用“零延迟”或“整个网站完全离线”的承诺。
- 延续现有品牌、排版和静态内容，增加工具区浅色/深色/跟随系统主题、可访问搜索弹窗（工具区 Cmd/Ctrl+K）、移动端布局及克制的桌面了解入口。CTA 复用真实发行清单，不暗示桌面已提供这些在线工具。
- 每个工具静态输出独立双语说明、示例、FAQ、metadata 与发现链接；扩展 sitemap、AI 文本索引和独立网站验证，保留 preview noindex、子路径与无 JS 导航。

## Capabilities

### New Capabilities

- `web-tools-shell`: 在线目录、可访问搜索/主题、隐私与资源边界、发现内容、真实桌面引导及独立静态交付。
- `web-timestamp-tool`: 当前时钟、严格双向转换、单位/时区和复制反馈。
- `web-json-tool`: 保真 JSON 格式化/压缩、错误诊断、折叠高亮与单次解转义。
- `web-base64-url-tool`: Unicode Base64、URL 组件及有界本地图片处理。

### Modified Capabilities

无。主规范目前只有 `main-window-shell` 和 `caffeine-duration`；官网既有规范仍在 `add-zero-product-website` 活跃变更中。本变更增加独立能力并遵守其官网基线，不复制或重新定义整份官网规范；未来同步/归档须先处理官网基础规范。

## Impact

- 仅实施于独立 `website/` Astro 静态站：页面、共享 layout、内容注册表、SEO/AI 索引、工具 scoped CSS、纯 TS 域逻辑、worker 和按需编辑器，以及网站测试、CI 和维护文档。
- 不修改桌面 `src/`、`src-tauri/`、IPC、发行包配置或 File 审批；不引入 Tauri/桌面依赖。优先 Astro + 浏览器原生 API；JSON 解析/编辑优先评估维护中的 `jsonc-parser` / CodeMirror 6，不为三个工具整体引入 React、Monaco、Tailwind 或 Shadcn。
- 与 `add-zero-product-website` 的 layout/内容/SEO 和 `package-zero-trial-profiles` 的发行事实存在衔接；维持当前清单 `unavailable` 的真实降级，不修改既有验收记录。
- 所有计算无需后端 API；静态资源首次加载仍需网络。实施验收包括双语/旧路由回归、输入保真、网络与存储观测、键盘/触摸、性能和浏览器检查。部署、公开包更新、搜索平台提交、提交代码、推送、spec sync 和归档均不包含在本次提案范围。
