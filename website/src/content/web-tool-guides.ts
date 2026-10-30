import { markdownGuides } from './markdown-content.ts';
import { unicodeGuides } from './unicode-content.ts';
import type { Locale } from './site.ts';
import type { WebTool } from './web-tools.ts';

export interface WebToolGuide {
  searchTitle: string;
  steps: string[];
  examples: { name: string; input: string; output: string }[];
  agent: { input: string; output: string; actions: string[] };
}

function imageGuide(locale: Locale, operation: 'convert' | 'watermark' | 'compress'): WebToolGuide {
  const zh = locale === 'zh';
  const title = { convert: zh ? '在线图片格式转换：HEIC、JPEG、PNG 与 WebP' : 'Online image converter: HEIC, JPEG, PNG and WebP', watermark: zh ? '在线图片文字水印：单处九宫格与平铺' : 'Online image text watermark: nine anchors and tiles', compress: zh ? '在线图片压缩：JPEG、WebP 与 PNG 无损优化' : 'Online image compression: JPEG, WebP and lossless PNG optimization' }[operation];
  return {
    searchTitle: title,
    steps: zh ? ['选择本地图片，查看队列中的格式、尺寸和限制提示。', '选择输出格式、质量或可选最长边；水印页填写文字并选择单处或平铺。', '显式点击处理，等待每项状态结束；检查预览和真实体积，再分别下载或打包当前成功结果。'] : ['Choose local images and inspect formats, dimensions and limit notices in the queue.', 'Choose format, quality or optional longest edge; on the watermark page enter text and choose single or tiled placement.', 'Explicitly start processing and wait for each status. Inspect previews and actual bytes, then download individual or ZIP current successful results.'],
    examples: [{ name: zh ? '演示说明（非真实照片处理结果）' : 'Illustrative scenario (not a measured photo result)', input: operation === 'watermark' ? 'PNG · 800 × 600 · Zero' : operation === 'convert' ? 'HEIC · 800 × 600' : 'JPEG · 800 × 600 · quality 75', output: operation === 'watermark' ? 'PNG · 800 × 600 · Zero (watermark)' : operation === 'convert' ? 'JPEG · 800 × 600' : zh ? 'JPEG · 800 × 600；体积以实际输出为准' : 'JPEG · 800 × 600; byte size depends on actual output' }],
    agent: { input: zh ? '使用选择图片控件导入本地文件；使用有标签的格式、质量、最长边和水印设置。不要把文件名、照片或水印写入 URL。' : 'Import local files with Choose images. Use labeled format, quality, longest-edge and watermark controls. Never put filenames, photos or watermark text in URLs.', output: zh ? '从逐项状态、尺寸、实际源与结果字节和预览读取结果；仅下载当前设置的成功结果。失败项可重试，取消不等于清空。' : 'Read per-item status, dimensions, actual source/result bytes and previews. Download only successes for current settings. Failed items can be retried; cancellation differs from clearing.', actions: zh ? ['显式处理、重试失败项或取消整批', '预览并分别下载或 ZIP 打包当前成功结果', '清空队列与结果；保留原图仍含原元数据'] : ['Explicitly process, retry failures or cancel the batch', 'Preview and download current successes individually or as ZIP', 'Clear queue and results; Keep original retains original metadata'] },
  };
}
export const webToolGuides: Record<Locale, Record<WebTool, WebToolGuide>> = {
  zh: {
    unicode: unicodeGuides.zh,
    markdown: markdownGuides.zh,
    'image-converter': /* @__PURE__ */ imageGuide('zh', 'convert'),
    'image-watermark': /* @__PURE__ */ imageGuide('zh', 'watermark'),
    'image-compressor': /* @__PURE__ */ imageGuide('zh', 'compress'),
    timestamp: {
      searchTitle: '在线时间戳转换工具：Unix 秒、毫秒与批量转换',
      steps: ['在单条模式输入 Unix 时间戳或日期，选择单位和无时区日期的解释时区。', '单条输入会自动转换；批量模式每行输入一个值，再点击“批量转换”。', '读取秒、毫秒、北京时间、UTC 和 ISO 结果；批量可复制或下载完整 JSON，失败行也会保留。'],
      examples: [
        { name: 'Unix 秒转 ISO 8601（自动识别）', input: '1700000000', output: '2023-11-14T22:13:20.000Z' },
        { name: '批量秒与毫秒（自动识别，以下为两行 ISO 结果）', input: '1700000000\n1700000000000', output: '2023-11-14T22:13:20.000Z\n2023-11-14T22:13:20.000Z' },
      ],
      agent: {
        input: '单条使用“时间戳或日期”；批量先切换“批量转换”，填写“每行一个时间戳或日期”。自动识别仅支持 10 位秒或 13 位毫秒，其他位数须选择单位；无时区日期默认 UTC+08:00。',
        output: '单条结果是带标签的时间值；批量结果包含原行号、成功值或错误，复制 JSON / 下载 JSON 提供完整版本化结果，不受分页影响。',
        actions: ['单条自动转换；批量点击“批量转换”', '选择秒、毫秒或自动识别与 UTC+08:00 / UTC', '复制时间值，或复制 / 下载批量 JSON'],
      },
    },
    json: {
      searchTitle: '在线 JSON 格式化、校验与压缩工具',
      steps: ['将严格 JSON 粘贴到“输入”，无需启用增强编辑。', '选择“格式化”“压缩”或“校验”；“去除转义”仅解开一层内容仍为合法 JSON 的 JSON 字符串。', '处理完成后读取“结果”；出错时查看状态中的行列提示，修正后重新执行。'],
      examples: [
        { name: '格式化（两空格缩进，保留大整数）', input: '{"id":9007199254740993,"ok":true}', output: '{\n  "id": 9007199254740993,\n  "ok": true\n}' },
        { name: '压缩', input: '{ "items": [1, 2], "ok": true }', output: '{"items":[1,2],"ok":true}' },
      ],
      agent: {
        input: '向“输入”文本框填写严格 JSON；支持对象、数组与标量，不接受注释或尾逗号。增强编辑为可选功能。',
        output: '格式化、压缩和去除转义的文本位于只读“结果”框；校验成功或失败以状态反馈为准，错误行列从 1 开始。',
        actions: ['格式化：两空格缩进', '压缩：去掉结构空白', '校验：检查严格 JSON', '去除转义：解开一层合法 JSON 字符串'],
      },
    },
    base64: {
      searchTitle: '在线 Base64 编解码与 URL 编码工具',
      steps: ['选择“文本 Base64”“URL 组件”或“图片 Base64”模式。', '填写输入；图片编码也可选择本地 PNG、JPEG 或 WebP，然后点击“编码”或“解码”。', '读取“结果”或本地图片预览；复制结果或主动下载图片。'],
      examples: [
        { name: '文本 Base64 编码（UTF-8）', input: '你好', output: '5L2g5aW9' },
        { name: 'URL 组件编码（加号不是空格）', input: 'a+b &中', output: 'a%2Bb%20%26%E4%B8%AD' },
      ],
      agent: {
        input: '先选择模式，再填写“输入”或选择本地图片。URL 模式针对组件，不是整个 URL 或表单编码；不会访问输入的网址。',
        output: '文本结果位于只读“结果”框；图片解码成功还显示预览和“下载图片”。Base64 是编码，不是加密。',
        actions: ['文本 Base64：UTF-8 编码 / 解码', 'URL 组件：编码 / 解码', '图片 Base64：本地图片编码 / 解码与下载'],
      },
    },
    diff: {
      searchTitle: '在线文本与文件对比工具：行级和行内差异',
      steps: ['分别填写“原始文本”和“修改后文本”，或通过各侧“打开文件”读取本地 UTF-8 纯文本。', '点击“查找差异”；输入和文件选择不会自动触发比较。', '查看增删、行内高亮和差异统计，使用前后差异导航或切换并排 / 统一视图。'],
      examples: [{ name: '替换一行（输入标注两侧，输出为增删行示意）', input: '原始文本：hello world\n修改后文本：hello Zero', output: '- hello world\n+ hello Zero' }],
      agent: {
        input: '在“原始文本”和“修改后文本”输入框填写两份文本，或分别打开 UTF-8 文本文件；不支持 PDF、Word、Excel、图片和文件夹。',
        output: '“比较结果”区域展示增删行、行内高亮、行号和统计；这不是 JSON 导出或自动合并接口。长行可能仅显示行级高亮。',
        actions: ['查找差异：显式比较当前两侧', '交换两侧或清空', '切换并排 / 统一视图，前后导航差异块'],
      },
    },
  },
  en: {
    unicode: unicodeGuides.en,
    markdown: markdownGuides.en,
    'image-converter': /* @__PURE__ */ imageGuide('en', 'convert'),
    'image-watermark': /* @__PURE__ */ imageGuide('en', 'watermark'),
    'image-compressor': /* @__PURE__ */ imageGuide('en', 'compress'),
    timestamp: {
      searchTitle: 'Online Unix timestamp converter: seconds, milliseconds and batches',
      steps: ['In single mode, enter a Unix timestamp or date, then select its unit and the timezone for unzoned dates.', 'Single values convert automatically. For a batch, enter one value per line and click Convert batch.', 'Read seconds, milliseconds, Beijing time, UTC and ISO results. Copy or download complete batch JSON, including failed rows.'],
      examples: [
        { name: 'Unix seconds to ISO 8601 (auto detect)', input: '1700000000', output: '2023-11-14T22:13:20.000Z' },
        { name: 'Batch seconds and milliseconds (auto detect; two ISO result rows)', input: '1700000000\n1700000000000', output: '2023-11-14T22:13:20.000Z\n2023-11-14T22:13:20.000Z' },
      ],
      agent: {
        input: 'Use Timestamp or date for a single value. For batches, switch to Batch conversion and fill One timestamp or date per line. Auto detect accepts only 10-digit seconds or 13-digit milliseconds; choose a unit otherwise. Unzoned dates default to UTC+08:00.',
        output: 'Single results are labeled time values. Batch results preserve source line numbers, successful values and errors. Copy JSON / Download JSON exports the complete versioned result regardless of pagination.',
        actions: ['Automatic single conversion; explicit Convert batch', 'Choose seconds, milliseconds or auto detect and UTC+08:00 / UTC', 'Copy time values or copy / download batch JSON'],
      },
    },
    json: {
      searchTitle: 'Online JSON formatter, validator and minifier',
      steps: ['Paste strict JSON into Input. Enhanced editing is optional.', 'Choose Format, Compact or Validate. Unescape only unwraps one JSON string whose contents remain valid JSON.', 'After completion, read Result. On failure, use the status line and column to fix the input, then run again.'],
      examples: [
        { name: 'Format (two-space indentation, preserving a large integer)', input: '{"id":9007199254740993,"ok":true}', output: '{\n  "id": 9007199254740993,\n  "ok": true\n}' },
        { name: 'Compact', input: '{ "items": [1, 2], "ok": true }', output: '{"items":[1,2],"ok":true}' },
      ],
      agent: {
        input: 'Fill Input with strict JSON: objects, arrays and scalars are accepted; comments and trailing commas are rejected. Enhanced editing is optional.',
        output: 'Format, Compact and Unescape put text in the read-only Result field. Validate reports success or failure in the status; error line and column numbers start at 1.',
        actions: ['Format: two-space indentation', 'Compact: remove structural whitespace', 'Validate: check strict JSON', 'Unescape: unwrap one valid JSON string'],
      },
    },
    base64: {
      searchTitle: 'Online Base64 encoder, decoder and URL encoding tool',
      steps: ['Choose Text Base64, URL component or Image Base64 mode.', 'Fill Input, or choose a local PNG, JPEG or WebP for image encoding, then click Encode or Decode.', 'Read Result or the local image preview. Copy the result or explicitly download the image.'],
      examples: [
        { name: 'Text Base64 encoding (UTF-8)', input: '你好', output: '5L2g5aW9' },
        { name: 'URL component encoding (plus is not a space)', input: 'a+b &中', output: 'a%2Bb%20%26%E4%B8%AD' },
      ],
      agent: {
        input: 'Choose a mode before filling Input or choosing a local image. URL mode handles components, not whole URLs or form encoding; it never visits the input URL.',
        output: 'Text appears in the read-only Result field. Successful image decoding also shows a preview and Download image. Base64 is encoding, not encryption.',
        actions: ['Text Base64: UTF-8 encode / decode', 'URL component: encode / decode', 'Image Base64: local encode / decode and download'],
      },
    },
    diff: {
      searchTitle: 'Online text and file comparison: line and inline diff',
      steps: ['Fill Original text and Changed text, or use Open file on each side to read local UTF-8 text.', 'Click Find differences. Editing or choosing files does not automatically compare.', 'Read added/deleted lines, inline highlights and counts. Navigate differences or switch between side-by-side and unified views.'],
      examples: [{ name: 'Replace one line (labeled source sides; illustrative removed/added output)', input: 'Original text: hello world\nChanged text: hello Zero', output: '- hello world\n+ hello Zero' }],
      agent: {
        input: 'Fill Original text and Changed text with two texts, or open UTF-8 text files on each side. PDF, Word, Excel, images and folders are unsupported.',
        output: 'The Comparison results region shows added/deleted lines, inline highlights, line numbers and counts. It is not a JSON export or automatic merge interface. Long lines may receive line-level highlighting only.',
        actions: ['Find differences: explicitly compare current sources', 'Swap sides or clear', 'Switch side-by-side / unified view and navigate difference blocks'],
      },
    },
  },
};

export const guideCopy = {
  zh: {
    directoryTitle: '在线开发、图片与文本工具：JSON、时间戳、Base64、对比与 Markdown',
    description: '九项免费在线工具：Unicode 转义转换、JSON 格式化、时间戳批量转换、Base64 / URL 编解码、文本对比、图片转换、水印、压缩和 Markdown 编辑。默认浏览器本地处理；Markdown 可主动开启本机草稿与外部图片。',
    steps: '操作步骤', examples: '输入与输出示例', input: '示例输入', output: '预期输出', limits: '格式与限制',
    agent: '浏览器 Agent 使用说明', actions: '支持的操作', agentInput: '输入方式', agentOutput: '读取结果',
    runtime: '这是浏览器交互工具，不是 HTTP 计算 API。计算需要 JavaScript，首次页面和按需资源加载需要网络。',
    execution: '使用页面标签定位输入和按钮；显式操作后等待状态结束，再读取当前结果。失败时先修正输入；修改输入或设置后不要使用旧结果。',
    entry: '工具入口',
  },
  en: {
    directoryTitle: 'Online developer, image and text tools: JSON, timestamps, Base64, diff and Markdown',
    description: 'Nine free online tools: Unicode escape conversion, JSON formatting, batch timestamps, Base64 / URL encoding, text diff, image conversion, watermarks, compression and Markdown editing. Local by default; Markdown offers opt-in browser drafts and external images.',
    steps: 'How to use', examples: 'Input and output examples', input: 'Example input', output: 'Expected output', limits: 'Formats and limits',
    agent: 'Browser agent usage', actions: 'Supported operations', agentInput: 'Input method', agentOutput: 'Reading results',
    runtime: 'These are interactive browser tools, not HTTP computation APIs. Computation requires JavaScript; initial page and on-demand asset loading need a network.',
    execution: 'Locate inputs and buttons by their page labels. After an explicit action, wait for the status to finish before reading the current result. Fix failed input first; do not reuse old results after changing input or settings.',
    entry: 'Tool entry',
  },
} as const;
