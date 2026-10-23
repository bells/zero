import type { Locale } from './site.ts';
import type { WebToolContent } from './web-tools.ts';
import type { WebToolGuide } from './web-tool-guides.ts';

export const markdownContent: Record<Locale, Omit<WebToolContent, 'guide' | 'category'>> = {
  zh: {
    slug: 'markdown', title: 'Markdown 编辑器', description: '在浏览器本地编辑和预览 Markdown，直接下载 Markdown、独立 HTML 与可选择、搜索文字的中文 PDF。', example: '# 你好，Zero\n\n- [x] 写作\n- [ ] 导出 PDF',
    notes: [
      'PDF 超过八列的宽表会改为带列名的逐行排版，以保留全部内容。中文字体不覆盖全部字符，补充平面字符和多数 emoji 会明确拒绝；斜体使用同字体直立字形。',
      '支持常用 Markdown、GFM 表格、任务列表、删除线和代码高亮；提供源码、预览、分屏、格式工具栏、撤销/重做、查找替换、标题目录与可关闭的滚动同步。原始 HTML 不执行；公式和 Mermaid 不进行图形渲染。',
      '粘贴或打开单个严格 UTF-8 .md / .markdown / .txt 文件，接受开头 BOM，统一 CRLF/CR 为 LF；源文、导入与草稿最多 1 MiB、20,000 行，不猜测 GBK。解析每次最多 5 秒。失败保留当前文档。',
      '默认仅在页面内存处理。可主动开启“在此浏览器保存草稿”，中英文共用一篇本机草稿；关闭会删除草稿并保留当前编辑，亦可单独删除。外部图片默认占位，每篇文档须主动授权 HTTP(S) 来源；原始 HTML 不执行，草稿不保存图片授权。',
      '直接下载 UTF-8 .md、含内嵌样式和已授权图片的独立 .html，或 A4 纵向、浅色正文、自动分页且中英文文字可选择/搜索的 .pdf。打印是独立操作，不替代 PDF 下载；HTML 不保留自动访问第三方的图片、字体或样式地址。缺图时须明确选择保留占位或返回修正。',
      '资源限额是保守容量策略，不是实机保证：HTML 和 PDF 各最多 32 MiB，PDF 最多 500 页、生成 60 秒；中文源字体最多 32 MiB，图片/字体单请求 15 秒。图片最多 10 张，单张 5 MiB、1600 万像素，合计 20 MiB、2000 万像素；仅静态 PNG/JPEG/WebP，拒绝 SVG、动画与无法安全获取的图片。',
      '页面和按需编辑器、PDF、中文字体仍需网络；文档不发送给字体服务或远程转换接口。浏览器本地生成不等于所有 Safari/iPhone 下载、字形或内存场景均已验收；这不是已内置的 Zero 桌面 Markdown 插件。',
    ],
    faq: [
      { question: 'Markdown 内容会被上传或自动保存吗？', answer: '默认不会上传或保存正文。只有主动开启本机草稿才保存一篇到此浏览器；外部图片仅在当前文档授权后请求来源。正文、标题、文件名、图片地址和草稿不会附加给搜索、遥测或反馈。' },
      { question: '下载 PDF 和打印有什么区别？', answer: '下载 PDF 在浏览器本地直接生成文字型文件，默认 A4 浅色排版，中英文可选择和搜索。打印使用浏览器打印对话框，可另存 PDF，但不是下载 PDF 按钮的替代流程。字体缺失、超限或失败会提示，不改成截图 PDF。' },
      { question: '为什么图片只显示占位？', answer: '外部图片需要当前文档主动授权；来源不支持 CORS、发生无法验证的跳转、格式不受支持或超出限额时仍保留占位并说明。导出前可明确选择保留占位，或返回修正，不使用服务器代理。' },
      { question: '离开页面后如何找回文档？', answer: '默认内容是临时的，请先下载 .md。主动开启草稿后可恢复此浏览器的一篇内容；关闭或删除会移除草稿。存储不可用时不会宣称已保存，仍可编辑和下载；浏览器崩溃或强杀不保证最后修改已保存。' },
    ],
  },
  en: {
    slug: 'markdown', title: 'Markdown editor', description: 'Edit and preview Markdown locally in your browser, with direct Markdown, standalone HTML and selectable, searchable Chinese-text PDF downloads.', example: '# Hello, Zero\n\n- [x] Write\n- [ ] Export PDF',
    notes: [
      'PDF tables with more than eight columns reflow into labelled column/value pairs to preserve every value. Unsupported glyphs, supplementary characters and most emoji are rejected explicitly; italic uses upright font faces.',
      'Supports common Markdown, GFM tables, task lists, strikethrough and code highlighting, with source, preview and split modes, formatting, undo/redo, find/replace, a heading outline and optional scroll synchronization. Raw HTML is inert; formulas and Mermaid are not rendered as diagrams.',
      'Paste text or open one strict UTF-8 .md / .markdown / .txt file. An initial BOM is accepted; CRLF/CR become LF. Source, imports and drafts are limited to 1 MiB and 20,000 lines; GBK is not guessed. Parsing has a 5-second limit. Failure preserves the current document.',
      'Content stays in page memory by default. Explicitly enable Save draft in this browser to keep one local draft shared by both languages. Turning it off deletes the draft while keeping current edits; a separate delete action is available. External images remain placeholders until HTTP(S) sources are authorized for this document. Raw HTML is inert and drafts never retain image permission.',
      'Directly download UTF-8 .md, standalone .html with embedded styles and authorized images, or a text-based .pdf with A4 portrait pages, a light body and automatic pagination. Chinese and Latin text is selectable/searchable. Print is separate from PDF download. HTML has no automatically fetched third-party image, font or style URLs. For missing images, explicitly keep placeholders or return to fix them.',
      'Conservative resource limits are capacity policies, not device guarantees: HTML and PDF each 32 MiB; PDF 500 pages and 60-second generation. Chinese source font: 32 MiB; image/font requests: 15 seconds each. Images: 10 total, 5 MiB / 16 million pixels each, 20 MiB / 20 million pixels combined. Only static PNG/JPEG/WebP; SVG, animation and images that cannot be safely fetched are rejected.',
      'Page, on-demand editor, PDF and Chinese font loading still need a network. Documents are not sent to font services or a remote conversion API. Local generation does not establish acceptance for every Safari/iPhone download, glyph or memory scenario. This is not an existing Zero desktop Markdown plugin.',
    ],
    faq: [
      { question: 'Is Markdown uploaded or automatically saved?', answer: 'By default, document content is neither uploaded nor saved. Only opting in stores one draft in this browser. External image sources are requested only with this document’s permission. Source, titles, filenames, image URLs and drafts are never attached to search, telemetry or feedback.' },
      { question: 'How is PDF download different from Print?', answer: 'Download PDF directly generates a text-based file locally, with light A4 pages and selectable/searchable Chinese and Latin text. Print opens the browser dialog and can save a PDF, but does not replace PDF download. Missing fonts, limits or failures produce a notice instead of a screenshot PDF.' },
      { question: 'Why are images placeholders?', answer: 'External images require explicit document permission. Missing CORS support, unverifiable redirects, unsupported formats or resource limits keep a placeholder with a reason. Before export, explicitly keep placeholders or return to fix the document. There is no server proxy.', },
      { question: 'Can I recover my document after leaving?', answer: 'Content is temporary by default: download .md first. Opting into a draft lets you recover one document in this browser; turning it off or deleting removes it. Unavailable storage never reports a successful save, and editing/downloads remain available. Browser crashes or forced shutdown may lose the latest edits.' },
    ],
  },
};

export const markdownGuides: Record<Locale, WebToolGuide> = {
  zh: {
    searchTitle: '在线 Markdown 编辑器：实时预览与 Markdown、HTML、中文 PDF 下载',
    steps: ['粘贴源文，或打开 UTF-8 .md、.markdown、.txt 文件；选择源码、预览或分屏。', '用格式工具栏和查找替换编辑，查看标题目录；外部图片先显示占位，确有需要时为当前文档授权来源。', '草稿默认关闭；需要时主动开启“在此浏览器保存草稿”，查看保存状态，随时关闭或删除。', '下载当前源文 .md、独立 .html 或文字型 .pdf；缺图先选择保留占位或返回修正。打印使用独立按钮，取消或失败后源文仍可编辑。'],
    examples: [{ name: '标题与任务列表（示意预览文字）', input: '# 你好，Zero\n\n- [x] 写作\n- [ ] 导出 PDF', output: '你好，Zero\n☑ 写作\n☐ 导出 PDF' }, { name: 'GFM 表格（示意预览文字）', input: '| 格式 | 用途 |\n| --- | --- |\n| .md | 继续编辑 |\n| .pdf | 阅读与分享 |', output: '格式 · 用途\n.md · 继续编辑\n.pdf · 阅读与分享' }],
    agent: { input: '在 Markdown 源码输入框填写文本，或打开单个 UTF-8 .md / .markdown / .txt（最多 1 MiB、20,000 行）。不要把正文、文件名、搜索词或草稿写入 URL；本机草稿和外部图片均须用户主动选择。', output: '从预览、标题目录和状态读取当前结果；下载 Markdown、下载 HTML、下载 PDF 分别产生文件，打印是独立动作。PDF 为 A4 浅色文字型文件，中英文可选择/搜索；错误或取消不能视为导出成功。', actions: ['源码 / 预览 / 分屏与格式编辑、撤销 / 重做、查找替换', '可选本机单篇草稿、删除草稿与当前文档图片授权', '直接下载 .md、独立 .html 与文字型中文 .pdf', '单独打印，取消处理或清空当前文档'] },
  },
  en: {
    searchTitle: 'Online Markdown editor: live preview and Markdown, HTML, Chinese PDF downloads',
    steps: ['Paste source or open one UTF-8 .md, .markdown or .txt file. Choose source, preview or split mode.', 'Edit with formatting and find/replace controls, and inspect the heading outline. External images start as placeholders; authorize sources for this document only when needed.', 'Draft saving is off by default. Explicitly enable Save draft in this browser when wanted, inspect its save status, and turn it off or delete it at any time.', 'Download current .md source, standalone .html or text-based .pdf. For missing images, choose placeholders or return to fix them. Print has a separate button; cancellation or failure preserves editable source.'],
    examples: [{ name: 'Heading and task list (illustrative preview text)', input: '# Hello, Zero\n\n- [x] Write\n- [ ] Export PDF', output: 'Hello, Zero\n☑ Write\n☐ Export PDF' }, { name: 'GFM table (illustrative preview text)', input: '| Format | Purpose |\n| --- | --- |\n| .md | Edit later |\n| .pdf | Read and share |', output: 'Format · Purpose\n.md · Edit later\n.pdf · Read and share' }],
    agent: { input: 'Fill Markdown source or open one UTF-8 .md / .markdown / .txt file (1 MiB and 20,000 lines maximum). Never put source, filenames, search queries or drafts in URLs. Browser drafts and external images require explicit user choices.', output: 'Read current preview, heading outline and status. Download Markdown, Download HTML and Download PDF each produce a file; Print is separate. PDF uses light A4 pages with selectable/searchable Chinese and Latin text. Errors and cancellation are not export success.', actions: ['Source / preview / split, formatting, undo / redo and find/replace', 'Optional single local draft, draft deletion and document image permission', 'Direct .md, standalone .html and text-based Chinese .pdf downloads', 'Separate Print, cancel processing or clear the current document'] },
  },
};
