## Why

Zero 当前九个在线工具集中在编码、图片转换和 Markdown，日常文本整理、二维码与开发调试场景仍有明显空缺。维护者已确认新增八个工具，以开发和通用场景兼顾、重复使用价值及可控维护成本为选择标准。

## What Changes

- 新增二维码生成与本地图片识别、文本整理、文本／文件哈希、JavaScript 正则测试、SQL 格式化、日期计算、随机密码生成和 Cron 表达式工具。
- 每项提供中文 `/tools/<slug>/` 与英文 `/en/tools/<slug>/`，共享静态指南、示例、分类与搜索信息。
- 分类扩展为开发、图片、文本、日期与计算，实施完成后的目标数量分别为 10、4、2、1，共 17 项。
- 正则明确采用 JavaScript 语法。SQL 提供 MySQL、PostgreSQL、SQLite 方言的格式化与压缩。Cron 提供 Unix 五字段、Spring 六字段、时区及未来十次执行时间。
- 日期计算提供自然日差、日期加减和排除周末。密码使用浏览器安全随机源。哈希提供 MD5、SHA-1、SHA-256、SHA-512 及预期摘要校验。
- 复用现有独立 Astro 工程、类型化规则、任务运行器、按需依赖和生命周期管理，为新计算建立输入、输出、耗时与展示限额。
- 增补双语目录、SEO/AI 发现输出、八个稳定反馈线程及相关验证。工具输入和结果继续在浏览器本地处理。

## Capabilities

### New Capabilities

- `web-everyday-tools-discovery` — 八工具、第四分类、双语发现、共同交互与隔离反馈契约。
- `web-qrcode-tool` — 文本／网址生成二维码、本地静态图片识别及 PNG/SVG 下载。
- `web-text-cleanup-tool` — 行去重、排序、空行与空白清理、大小写转换及明确执行顺序。
- `web-hash-tool` — 文本和文件的四种哈希摘要、增量处理及摘要校验。
- `web-regex-tool` — JavaScript 正则匹配、捕获组、替换与可终止计算。
- `web-sql-tool` — 三种 SQL 方言的格式化、词法安全压缩与错误反馈。
- `web-date-calculator` — 日期差、自然日／周末排除加减及确定的日历语义。
- `web-password-tool` — 有界、无偏、安全随机的密码生成与批量结果。
- `web-cron-tool` — 分模式解析、双语说明、时区与有界未来执行时间计算。

### Modified Capabilities

无。当前主规范覆盖桌面主窗口和 Awake 时长。网站能力仍分布在未归档变更中，本提案以新能力补充其范围，相关历史变更在设计中列出衔接关系。

## Impact

- 主要涉及 `website/src/content/`、`lib/web-tools/`、`scripts/web-tools/`、`components/webTools/`，以及路由、构建发现输出和验证脚本。
- 在独立 `feedback/` 工程登记八个 `tools/<slug>` 线程、双语主题与契约验证，沿用按需加载的默认配置。
- 实施前核验二维码、哈希、SQL、Cron 开源候选的维护状态、许可证、浏览器兼容、体积和语义，固定实际采用版本并保留许可材料。
- 实施时依据生成结果更新 README 中英文介绍及当前维护地图。17 工具、18 反馈线程和新增 16 个双语工具页面均为本提案目标，交付证据按源码、自动化、设备与部署分别记录。
