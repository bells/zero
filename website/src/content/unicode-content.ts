import type { Locale } from './site.ts';
import type { WebToolContent } from './web-tools.ts';
import type { WebToolGuide } from './web-tool-guides.ts';

export const unicodeContent: Record<Locale, Omit<WebToolContent, 'guide' | 'category'>> = {
  zh: {
    slug: 'unicode', title: 'Unicode 转义转换',
    description: 'Unicode 转文字、文字转 Unicode，支持混合文本、emoji 和错误定位，在浏览器本地处理。',
    example: '\\u4F60\\u597D ↔ 你好',
    notes: [
      '解码支持小写 u 的 \\uXXXX 和 \\u{...}，十六进制数字不区分大小写。固定形式支持合法代理对；花括号为 1–6 位、最大 U+10FFFF，不能是代理项。',
      '仅转换 Unicode 转义，不解析或格式化 JSON，不转换 U+ 码点、HTML 实体、URL 编码、\\n 或 \\t。URL 编解码请使用 Base64 与 URL 工具。解码结果不保证仍是合法 JSON，也不是可直接嵌入任意 Java/JS 源码的字符串字面量。',
      '每次只解码一层，成对原始反斜杠保留，只有奇数个中的末尾反斜杠可启动转义。解码产生的反斜杠不再扫描，不递归去除转义。',
      '文字转 Unicode 默认保留可打印 ASCII，反斜杠和 ASCII 控制字符始终转义；可勾选同时转义 ASCII。输出使用大写十六进制的 \\uXXXX，emoji 使用代理对。不 trim、不做 Unicode 归一化。',
      '输入最多 1 MiB UTF-8、结果最多 8 MiB、处理最多 5 秒，可取消。编码可能膨胀，完整下载结果可能超过再次粘贴的输入上限。超限或首个非法转义/孤立代理项使整次失败，不截断；行列从 1 开始，列按 UTF-16 单元计。',
      '只接受粘贴或键入文本，没有文件导入、内容历史或自动保存。复制或 TXT 下载由你主动触发；修改输入/选项会使旧结果失效。首次页面和资源加载仍需网络。',
    ],
    faq: [
      { question: '为什么两条反斜杠的转义没有转成文字？', answer: '连续反斜杠先按对保留，避免误改用于展示的字面转义。每次只处理原始输入的一层；不自动重复解码。' },
      { question: '实际换行和可见的 \\n 有什么区别？', answer: '实际 LF 换行编码为 \\u000A；反斜杠加字母 n 编码为 \\u005Cn。解码后保持两者区别；反斜杠始终转义以支持文字往返还原。' },
      { question: '整段日志和 JSON 都能粘贴吗？', answer: '可以作为普通文本粘贴，未转义部分保持原样。这里只转换 Unicode 转义，不校验 JSON 结构；错误会保留输入并提示原始行列。' },
    ],
  },
  en: {
    slug: 'unicode', title: 'Unicode escape converter',
    description: 'Convert Unicode escapes to text and text to Unicode locally, with mixed text, emoji and precise error locations.',
    example: '\\u4F60\\u597D ↔ 你好',
    notes: [
      'Decode lowercase-u \\uXXXX and \\u{...}; hexadecimal digits are case-insensitive. Fixed escapes support valid surrogate pairs; braces require 1–6 digits, at most U+10FFFF, excluding surrogate values.',
      'Only Unicode escapes are converted. JSON structure, U+ notation, HTML entities, URL encoding, \\n and \\t are not parsed. Use Base64 & URL codec for URL actions. Decoded output is not guaranteed to remain valid JSON or form a directly embeddable Java/JS string literal.',
      'One layer per operation: original backslash pairs stay unchanged, and only the final unpaired backslash can start an escape. A decoded backslash is never scanned again; decoding is not recursive.',
      'Encoding preserves printable ASCII by default, except backslashes and ASCII controls, which are always escaped. Escape ASCII too encodes the remaining ASCII characters. Output uses uppercase \\uXXXX and surrogate pairs for emoji, without trimming or Unicode normalization.',
      'Input: 1 MiB UTF-8; result: 8 MiB; processing: 5 seconds, cancellable. Expanded encoding may exceed the input limit when pasted back. Limits or the first invalid escape/isolated surrogate fail the whole operation without truncation. Positions are 1-based; columns count UTF-16 units.',
      'Paste or type text only: no file import, content history or autosave. Copy and TXT download require your action. Editing input/options invalidates old results. Initial page and assets need a network.',
    ],
    faq: [
      { question: 'Why does an escape with two backslashes stay unchanged?', answer: 'Original backslash pairs are retained to protect literal escape text. Each operation handles one original layer, without automatic repeated decoding.' },
      { question: 'How does a real newline differ from visible \\n?', answer: 'An actual LF encodes as \\u000A; a backslash followed by n encodes as \\u005Cn. Decoding preserves the distinction. Backslashes are always escaped for reversible text round trips.' },
      { question: 'Can I paste an entire log or JSON document?', answer: 'Yes, as plain text. Ordinary text is preserved; only Unicode escapes are converted. JSON structure is not validated. Failures retain input and report original line/column positions.' },
    ],
  },
};

function guide(locale: Locale): WebToolGuide {
  const zh = locale === 'zh';
  return {
    searchTitle: zh ? '在线 Unicode 转文字与 Unicode 转义转换' : 'Online Unicode to text and text to Unicode escape converter',
    steps: zh
      ? ['粘贴混合文本或点击示例，选择是否同时转义 ASCII。示例不自动执行。', '点击 Unicode 转文字或文字转 Unicode；错误时按原始行列修正输入。', '读取结果，主动复制或下载完整 UTF-8 TXT；修改输入后重新转换。']
      : ['Paste mixed text or insert an example; optionally select Escape ASCII too. Examples do not run automatically.', 'Choose Unicode to text or Text to Unicode. Fix errors at their original line and column.', 'Read Result, then explicitly copy or download complete UTF-8 TXT. Convert again after editing input.'],
    examples: [
      { name: zh ? '混合文字与 emoji 解码' : 'Decode mixed text and emoji', input: '\\u4F60\\u597D，Zero \\u{1F600}', output: '你好，Zero 😀' },
      { name: zh ? '文字编码（默认设置）' : 'Encode text (default settings)', input: '你好，Zero 😀', output: '\\u4F60\\u597D\\uFF0CZero \\uD83D\\uDE00' },
      { name: zh ? '单层解码，不递归处理' : 'Decode one layer without recursion', input: '\\u005Cu4F60', output: '\\u4F60' },
    ],
    agent: {
      input: zh ? '填写输入文本，使用明确方向按钮；ASCII 选项仅影响编码。内容不写入 URL。' : 'Fill Input and use an explicit direction button; the ASCII option only affects encoding. Never put content in the URL.',
      output: zh ? '在只读结果区读取当前成功结果；错误包含原始行列。修改内容后旧结果及下载立即失效。' : 'Read the current successful text in the read-only Result field; errors identify original positions. Edits invalidate results and downloads.',
      actions: zh ? ['Unicode 转文字：单层解码', '文字转 Unicode：可还原编码', '复制完整结果、下载 TXT 或清空'] : ['Unicode to text: decode one layer', 'Text to Unicode: reversible encoding', 'Copy complete result, download TXT or clear'],
    },
  };
}
export const unicodeGuides: Record<Locale, WebToolGuide> = { zh: guide('zh'), en: guide('en') };
