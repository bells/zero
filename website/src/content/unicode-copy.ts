export const unicodeCopy = {
  zh: {
    decode: 'Unicode 转文字', encode: '文字转 Unicode', ascii: '同时转义 ASCII',
    asciiHint: '仅影响文字转 Unicode；反斜杠和控制字符始终转义。',
    decodeExample: '填入转义示例', encodeExample: '填入文字示例', download: '下载 TXT',
    limits: '输入最多 1 MiB UTF-8，结果最多 8 MiB。每次只解码一层，不解析 JSON 结构。',
    empty: '请输入要转换的文本。', success: '转换完成，可复制或下载完整结果。',
  },
  en: {
    decode: 'Unicode to text', encode: 'Text to Unicode', ascii: 'Escape ASCII too',
    asciiHint: 'Applies to Text to Unicode; backslashes and control characters are always escaped.',
    decodeExample: 'Insert escape example', encodeExample: 'Insert text example', download: 'Download TXT',
    limits: 'Input: 1 MiB UTF-8. Result: 8 MiB. Decodes one layer without parsing JSON structure.',
    empty: 'Enter text to convert.', success: 'Converted. Copy or download the complete result.',
  },
} as const;
