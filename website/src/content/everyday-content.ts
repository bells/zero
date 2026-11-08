import type { Locale } from "./site.ts";
import type { WebToolContent } from "./web-tools.ts";
import type { WebToolGuide } from "./web-tool-guides.ts";
import type { EverydayTool } from "../lib/web-tools/everyday-contracts.ts";

interface ToolDefinition {
  slug: EverydayTool;
  title: [string, string];
  description: [string, string];
  example: { input: string; output: string };
  notes: [string[], string[]];
  faq: [string, string, string, string];
}
const definitions: ToolDefinition[] = [
  {
    slug: "qrcode",
    title: ["二维码生成与识别", "QR code generator & reader"],
    description: [
      "将文字生成二维码，或识别本地静态图片，主动下载 PNG 和 SVG。",
      "Generate QR codes from text or read a local still image, with PNG and SVG exports.",
    ],
    example: { input: "你好，Zero 😀\n", output: "你好，Zero 😀\n" },
    notes: [
      [
        "生成保留原文 UTF-8、空白和换行，最多 2000 字节，固定 M 纠错、至少四模块静区、黑白完整模块。PNG 为 1024 × 1024，SVG 为受控矢量路径，每项最多 4 MiB。",
        "识别单张静态 PNG/JPEG/WebP，按实际内容核对格式与尺寸。每张最多 16 MiB、12,200,000 像素、最长边 8192；拒绝动画、HEIC、SVG 和坏图。只返回首个可解二维码，解码文本最多 64 KiB UTF-8。",
        "生成最多 5 秒；图片读取与识别合计最多 10 秒，可取消。网址仅作为文本显示，复制后自行决定是否访问。示例展示二维码解码后的原文。",
      ],
      [
        "Generation preserves exact UTF-8, whitespace and newlines, up to 2000 bytes. Error correction M, at least four quiet modules, black and white whole modules. PNG is 1024 × 1024; SVG contains controlled vector paths. Each export is limited to 4 MiB.",
        "Read one static PNG/JPEG/WebP, validating actual content and dimensions. Maximum 16 MiB, 12,200,000 pixels and edge 8192. Animation, HEIC, SVG and malformed images fail. Only the first decodable QR payload is returned, up to 64 KiB UTF-8.",
        "Generation stops after 5 seconds. Image reading and recognition share a 10-second deadline and can be cancelled. URLs display as text. The example shows text recovered by decoding the QR image.",
      ],
    ],
    faq: [
      "会访问二维码里的网址吗？",
      "结果以纯文本展示，不预览或访问目标网址。",
      "Will a decoded URL be opened?",
      "The result is plain text, without a preview or a request to its target.",
    ],
  },
  {
    slug: "text-cleanup",
    title: ["文本整理", "Text cleanup"],
    description: [
      "按明确顺序清理空白、转换大小写、移除空行、行去重和排序。",
      "Trim ASCII whitespace, change case, remove empty lines, deduplicate and sort in a fixed order.",
    ],
    example: { input: "a\na\nb\n", output: "a\nb\n" },
    notes: [
      [
        "固定顺序为逐行首尾 ASCII 空格/制表符清理 → 标准大小写转换 → 移除空行 → 区分大小写去重 → UTF-16 字典排序。默认仅去重，保留第一次出现。",
        "排序是字符串排序，1、10、2 按此顺序排列；大小写使用标准非 locale 转换。CR/CRLF 统一为 LF，终止换行独立保留，全部内容行被移除时成功输出空文本。",
        "输入最多 1 MiB UTF-8、20,000 内容行，输出最多 8 MiB，5 秒截止。完整复制和 TXT 下载独立于展示长度，空成功结果也可下载。",
      ],
      [
        "Fixed order is per-line ASCII space/tab trim → standard case conversion → empty-line removal → case-sensitive deduplication → UTF-16 lexical sort. Only deduplication is enabled by default, preserving the first occurrence.",
        "Sorting compares strings, so 1, 10, 2 is ascending order. Case conversion is non-locale. CR/CRLF normalize to LF. A final separator is retained separately; removing all content lines succeeds with empty text.",
        "Input is limited to 1 MiB UTF-8 and 20,000 content lines, output to 8 MiB, with a 5-second deadline. Copy and TXT contain the complete result, including a successful empty output.",
      ],
    ],
    faq: [
      "去重是否忽略大小写？",
      "去重本身区分大小写。先选小写转换时，A 和 a 会合并。",
      "Does deduplication ignore case?",
      "Deduplication is case-sensitive. Selecting lowercase first makes A and a duplicates.",
    ],
  },
  {
    slug: "hash",
    title: ["文本／文件哈希", "Text & file hash"],
    description: [
      "计算 MD5、SHA-1、SHA-256、SHA-512，校验预期摘要并分块处理文件。",
      "Compute MD5, SHA-1, SHA-256 or SHA-512, compare an expected digest and hash files incrementally.",
    ],
    example: {
      input: "abc",
      output:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    },
    notes: [
      [
        "默认 SHA-256。文本按原文有效 Unicode 的 UTF-8 字节计算，不 trim 或归一化；空文本有效。文件按原始字节处理，零字节文件有效。输出为小写十六进制。",
        "预期摘要可带两端 ASCII 空白，十六进制大小写无关。必须符合所选算法的精确长度；格式错误与不匹配分别提示。MD5/SHA-1 存在碰撞限制，仅适合作为兼容性校验和。",
        "文本最多 1 MiB、5 秒；单文件最多 256 MiB、60 秒，按最多 1 MiB 分块读取。WASM 初始化失败不产生摘要。TXT 包含算法与完整摘要。",
      ],
      [
        "SHA-256 is the default. Text uses exact valid-Unicode UTF-8 bytes without trimming or normalization. Empty text and zero-byte files are valid. Files use original bytes and digests are lowercase hexadecimal.",
        "Expected digests allow surrounding ASCII whitespace and either hexadecimal case, with exact algorithm-specific length. Invalid syntax differs from mismatch. MD5/SHA-1 have collision weaknesses and serve compatibility checksums.",
        "Text is limited to 1 MiB and 5 seconds. One file may be up to 256 MiB with a 60-second deadline, read in chunks of at most 1 MiB. WASM initialization failure produces no digest. TXT includes algorithm and full digest.",
      ],
    ],
    faq: [
      "换行会改变摘要吗？",
      "会。空格、换行、编码后的每个字节都参与计算。",
      "Does a newline change the digest?",
      "Yes. Every byte, including spaces and newlines, participates in the digest.",
    ],
  },
  {
    slug: "regex",
    title: ["正则表达式测试", "Regular expression tester"],
    description: [
      "测试 JavaScript 正则，查看匹配、UTF-16 位置、捕获组与替换预览。",
      "Test JavaScript regex with matches, UTF-16 offsets, captures and replacement previews.",
    ],
    example: { input: "(a)(b) · g · $2-$1\nab ab", output: "b-a b-a" },
    notes: [
      [
        "输入模式正文，不加斜杠分隔符。flags 仅支持 g/i/m/s/u/y，不重复。遵循原生 JavaScript 全局、粘连、编号与命名捕获组、替换模板语义。",
        "位置为原始样本文本从 0 开始的 UTF-16 单元偏移，零长度全局匹配按 Unicode 模式推进。最多 1000 个匹配，每页 50 项，样本高亮为惰性纯文本。",
        "样本最多 1 MiB、模式 8 KiB、替换模板 64 KiB、完整序列化结果 8 MiB。编译、匹配和替换在可终止 Worker 中执行，5 秒截止；超限整次失败。TXT 为完整替换文本。",
      ],
      [
        "Enter a pattern body without slash delimiters. Supported flags are g/i/m/s/u/y, without repetition. Global, sticky, numbered/named capture and replacement-template behavior follows native JavaScript.",
        "Offsets count zero-based UTF-16 units in the original sample. Empty global matches advance according to Unicode mode. Maximum 1000 matches, shown 50 per page, with inert text highlighting.",
        "Sample is limited to 1 MiB, pattern to 8 KiB, replacement to 64 KiB and complete serialized result to 8 MiB. Compilation, matching and replacement run in a terminable Worker with a 5-second deadline. TXT contains the full replacement.",
      ],
    ],
    faq: [
      "支持 Java 或 Python 正则吗？",
      "使用浏览器 JavaScript RegExp 语法，其他语言的扩展语法需要调整。",
      "Does it use Java or Python regex?",
      "It uses browser JavaScript RegExp syntax. Other language extensions may need changes.",
    ],
  },
  {
    slug: "sql",
    title: ["SQL 格式化", "SQL formatter"],
    description: [
      "按 MySQL、PostgreSQL、SQLite 方言格式化或保守压缩 SQL。",
      "Format or conservatively compact MySQL, PostgreSQL and SQLite SQL.",
    ],
    example: {
      input: "select a from t where id = 1",
      output: "select\n  a\nfrom\n  t\nwhere\n  id = 1",
    },
    notes: [
      [
        "默认 MySQL，可选择 PostgreSQL 或 SQLite。格式化使用两空格缩进并保留关键字、标识符、参数、字符串和注释内容。",
        "压缩仅折叠词法允许的空白，保留普通注释、执行注释、提示、行注释终止换行和 PostgreSQL 相邻字符串所需换行。未支持词法结构明确报错。",
        "输入最多 1 MiB UTF-8、输出 8 MiB、5 秒且可取消。这里进行格式处理，不连接数据库，也不保证语句在目标服务器上有效或可执行。",
      ],
      [
        "MySQL is the default, with PostgreSQL and SQLite selectable. Formatting uses two spaces while preserving keyword/identifier case, parameters, strings and comment contents.",
        "Compaction folds only lexically dispensable whitespace. Ordinary/executable comments, hints, line-comment termination and required PostgreSQL adjacent-string newlines remain. Unsupported lexical constructs fail explicitly.",
        "Input is limited to 1 MiB UTF-8, output to 8 MiB, with a cancellable 5-second deadline. This processes formatting without a database connection or server-side validity/execution guarantee.",
      ],
    ],
    faq: [
      "会执行 SQL 吗？",
      "全部在浏览器处理格式，没有数据库连接。",
      "Will it execute SQL?",
      "Formatting runs entirely in the browser without a database connection.",
    ],
  },
  {
    slug: "date-calculator",
    title: ["日期计算", "Date calculator"],
    description: [
      "计算有符号日期差和日期加减，可排除周六周日，结果与时区无关。",
      "Calculate signed date differences and shifts, optionally excluding weekends, independently of timezone.",
    ],
    example: { input: "2026-11-06 → 2026-11-09", output: "3" },
    notes: [
      [
        "严格接受 YYYY-MM-DD 公历日期，范围 0001-01-01 至 9999-12-31。使用整数日序，与 DST 和本机时区无关。",
        "自然日差为结束减开始，同日为 0。排除周末时，排除较早日、计入较晚日，再按原输入方向赋符号。周末仅指周六周日，不包含法定节假日与调休。",
        "加减量为绝对值最多 3,652,058 的整数。排除周末从起始日之后/之前计数，0 保留原日期。越界明确报错，5 秒截止。",
      ],
      [
        "Strict Gregorian YYYY-MM-DD dates range from 0001-01-01 through 9999-12-31. Integer calendar days are independent of DST and device timezone.",
        "Natural difference is end minus start, with same-day zero. Excluding weekends counts after the earlier date through the later date, then applies input direction. Weekends mean Saturday/Sunday without public-holiday or compensatory-workday adjustments.",
        "Shift by an integer with absolute value at most 3,652,058. Weekday shifts count strictly after/before the start. Zero preserves the original date, even on a weekend. Out-of-range results fail. Deadline is 5 seconds.",
      ],
    ],
    faq: [
      "排除周末会处理调休吗？",
      "只排除周六周日，不使用地区假日或调休日历。",
      "Does weekend exclusion include public holidays?",
      "It excludes Saturday and Sunday only, without regional holiday calendars.",
    ],
  },
  {
    slug: "password",
    title: ["随机密码生成", "Random password generator"],
    description: [
      "用浏览器安全随机源生成密码，每条包含各组选中字符，支持批量复制。",
      "Generate passwords with secure browser randomness, selected-group guarantees and batch copy.",
    ],
    example: {
      input: "20 × 1 · A–Z a–z 0–9",
      output: "20 characters; at least one uppercase, lowercase and digit",
    },
    notes: [
      [
        "长度 8–128，数量 1–100；默认长度 20、数量 1，选择大写、小写、数字。符号集合固定为 !@#$%^&*()-_=+[]{}?，至少选择一组。",
        "每条包含所有选中组的至少一个字符。crypto.getRandomValues 配合拒绝采样，避免取模偏差，再拒绝缺少字符组的整条候选。",
        "最多 10,000 个候选尝试、5 秒截止。随机源不可用或失败明确报错，没有弱随机回退。只在点击后生成，可逐条/批量复制，每行一条 TXT。示例描述条件，真实结果每次随机。",
      ],
      [
        "Length 8–128, count 1–100. Defaults are length 20, count 1, uppercase/lowercase/digits. Symbols are fixed to !@#$%^&*()-_=+[]{}?. At least one group is required.",
        "Every password includes each selected group. crypto.getRandomValues uses rejection sampling to avoid modulo bias, then rejects whole candidates missing a required group.",
        "Maximum 10,000 candidate attempts and 5 seconds. Secure-random failure is explicit, without a weak fallback. Generation is explicit, with per-item/batch copy and one password per TXT line. The example describes constraints; actual results are random.",
      ],
    ],
    faq: [
      "会保存密码吗？",
      "仅保留在本页内存。修改选项、清空或离开会释放结果和复制回退内容。",
      "Are passwords saved?",
      "They remain in page memory. Changing options, clearing or leaving releases results and manual-copy content.",
    ],
  },
  {
    slug: "cron",
    title: ["Cron 表达式工具", "Cron expression tool"],
    description: [
      "解释 Unix 五字段和 Spring 六字段 Cron，按 IANA 时区预览未来十次时间。",
      "Explain Unix five-field and Spring six-field Cron, with the next ten instants in an IANA timezone.",
    ],
    example: {
      input: "0 9 * * * · UTC · 2026-11-08T00:00:00Z",
      output: "2026-11-08T09:00:00.000Z",
    },
    notes: [
      [
        "默认 Unix 五字段，Spring 严格六字段并以秒开头。支持范围、列表、步长、英文月份/星期，0/7 为周日。拒绝年份和宏。Unix 受限月日/星期按 OR（带通配字段按 Vixie 规则），Spring 按 AND 并支持 ?、L、L-n（n 为 1–27）、LW、nW、dL、d#n。",
        "基准留空时采用执行时刻并冻结 UTC 基准，可输入带 Z 或数字偏移的 ISO 时间以重现结果。IANA 时区默认浏览器识别值，失败时显示 UTC 回退。结果严格晚于基准、按 UTC 递增，并显示目标本地时间和数值偏移。",
        "Unix 单个数字分钟/小时为固定时刻，DST 缺失时移到当天首个有效瞬间，重复时取第一次。其他分钟/小时表达式为间隔，跳过缺失并包含重复的两个瞬间。Spring 跳过缺失、保留重复，与 7.0.10 参考一致。",
        "表达式最多 1 KiB，搜索基准之后五十年内的十次，5 秒且可取消。不足十次或零次会显示数量和搜索边界；超时单独报错。TXT 含模式、时区、基准和完整序列。本工具只预测时间，不创建定时任务。",
      ],
      [
        "Default Unix requires five fields. Spring requires six with leading seconds. Ranges, lists, steps, English month/weekday names and Sunday 0/7 are supported. Years/macros fail. Unix restricted day fields use OR with Vixie wildcard-origin rules. Spring uses AND and supports ?, L, L-n (n from 1 through 27), LW, nW, dL and d#n.",
        "A blank baseline uses execution time and freezes that UTC instant. Explicit ISO input requires Z or a numeric offset. IANA timezone defaults to browser detection with a visible UTC fallback. Results are strictly after baseline, UTC-ordered, showing target local time and numeric offset.",
        "Unix single numeric minute/hour is fixed-time. Missing DST times move to the first valid instant that day; repeated times use the first occurrence. Other minute/hour expressions are interval schedules, skipping gaps and including both repeated instants. Spring skips gaps and includes repeats, following the 7.0.10 reference.",
        "Expression is limited to 1 KiB. Search seeks ten occurrences within fifty years after baseline with a cancellable 5-second deadline. Fewer or zero results disclose count and horizon; timeout is a separate error. TXT includes mode, zone, baseline and complete sequence. This predicts times without scheduling jobs.",
      ],
    ],
    faq: [
      "为什么两次本地时间一样？",
      "DST 回拨可能重复本地时间，结果中的 UTC 瞬间和数值偏移可区分它们。",
      "Why can two local times look identical?",
      "DST folds repeat wall-clock labels. UTC instants and numeric offsets distinguish them.",
    ],
  },
];
export function everydayContent(
  locale: Locale,
): Omit<WebToolContent, "guide" | "category">[] {
  const index = locale === "zh" ? 0 : 1;
  return definitions.map((item) => ({
    slug: item.slug,
    title: item.title[index],
    description: item.description[index],
    example: item.example.input,
    notes: item.notes[index],
    faq: [{ question: item.faq[index * 2]!, answer: item.faq[index * 2 + 1]! }],
  }));
}
export function everydayGuides(
  locale: Locale,
): Record<EverydayTool, WebToolGuide> {
  const zh = locale === "zh";
  return Object.fromEntries(
    definitions.map((item) => [
      item.slug,
      {
        searchTitle: item.title[zh ? 0 : 1],
        steps: zh
          ? [
              "填写本工具有标签的输入和选项，或插入示例。示例等待主动执行。",
              "点击主要操作，查看状态、结果和错误；需要时取消并修改输入。",
              "主动复制或下载当前完整结果；修改输入或选项后重新执行。",
            ]
          : [
              "Fill the labeled inputs and settings or insert an example, which waits for explicit execution.",
              "Choose the primary action and inspect status, result or errors. Cancel and edit when needed.",
              "Explicitly copy or download the complete current result. Execute again after changing input or settings.",
            ],
        examples: [
          {
            name: zh ? "输入与结果示例" : "Input and result example",
            ...item.example,
            output: item.slug === "password" && zh ? "20 个字符，至少包含一个大写字母、小写字母和数字" : item.example.output,
          },
        ],
        agent: {
          input: zh
            ? "使用有标签的输入、模式及选项控件。内容、文件名和设置仅保留在当前页面，不放入 URL 或反馈。"
            : "Use labeled input, mode and option controls. Keep content, filenames and settings in this page, outside URLs and feedback.",
          output: zh
            ? "从状态区确认执行成功后读取当前结果。TXT/复制提供完整结果，显示区可能仅为预览。"
            : "Confirm success in the status area before reading current results. TXT/copy provide complete output; the display may be a preview.",
          actions: zh
            ? ["显式执行或插入示例", "取消处理、复制、下载或清空"]
            : [
                "Explicitly execute or insert an example",
                "Cancel, copy, download or clear",
              ],
        },
      },
    ]),
  ) as Record<EverydayTool, WebToolGuide>;
}
