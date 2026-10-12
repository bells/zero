import { catalog, copy, links, path, type Locale } from './site.ts';

export const reviewedAt = '2026-10-12';
export const toolSlugs = ['snap', 'launch', 'awake', 'paper', 'file'] as const;
export type ToolSlug = typeof toolSlugs[number];
export interface DocumentSection { id: string; heading: string; paragraphs: string[]; steps?: string[] }
export interface DocumentSource { title: string; url: string }
export interface ProductDocument {
  page: string; title: string; description: string; sections: DocumentSection[]; sources: DocumentSource[];
}
export const resourceLabels: Record<Locale, { guide: string; faq: string; contents: string; reviewed: string; sources: string; related: string; details: string; home: string }> = {
  zh: { guide: '安装指南', faq: '常见问题', contents: '本页内容', reviewed: '内容核对', sources: '来源与进一步阅读', related: '继续了解', details: '使用说明', home: '首页' },
  en: { guide: 'Installation guide', faq: 'FAQ', contents: 'On this page', reviewed: 'Content reviewed', sources: 'Sources and further reading', related: 'Explore more', details: 'Usage guide', home: 'Home' },
};

interface ToolDetail { title: string; description: string; steps: string[]; boundary: [string, string, string] }
const details: Record<Locale, Record<ToolSlug, ToolDetail>> = {
  zh: {
    snap: {
      title: 'Zero Snap：截图与标注', description: '了解 Zero Snap 如何捕获、标注和复制屏幕内容，以及 macOS 自定义截图与 Windows 系统截图入口的区别。',
      steps: ['从 Zero 的快速入口或主窗口选择 Snap。', 'macOS 上选择需要的屏幕区域，在截图编辑界面标注重点，再复制结果。', 'Windows 上使用被打开的系统截图工具，按系统提供的流程选择和处理截图。'],
      boundary: ['macOS 使用 Zero 自定义截图与编辑；Windows 打开系统截图工具，两端的编辑界面与功能并不相同。', '屏幕捕获可能需要系统授权。遇到权限提示时先在系统设置检查授权，再重试。', 'macOS 离线 OCR 已有开发构建验证，但不据此承诺当前试用安装包包含 OCR；实际交付以公开包说明为准。'],
    },
    launch: {
      title: 'Zero Launch：搜索并启动应用', description: '使用名称或拼音查找应用，了解 Zero Launch 的快速入口、默认快捷键以及 macOS 和 Windows 的应用来源差异。',
      steps: ['打开 Zero Launch，输入应用名称或拼音。', '查看匹配结果，选择要启动的应用。', '需要快捷入口时，在设置中核对当前快捷键与系统冲突。macOS 默认 Option + Space，Windows 默认 Ctrl + Alt + Space。'],
      boundary: ['Launch 面向本机应用搜索，不是网页搜索或文件内容搜索。可发现的应用来源依操作系统不同。', '默认快捷键已有源码和自动检查，物理全局快捷键与系统搜索索引仍有设备验收项；不保证所有系统配置都能直接使用。', '系统应用搜索入口属于打包配置能力，开发构建、不同 profile 与缺席工具的行为应以对应包说明为准。'],
    },
    awake: {
      title: 'Zero Awake：防止电脑休眠', description: '演示、下载或长任务期间，用 Zero Awake 设置保持唤醒的时长，查看状态并在任务结束后关闭。',
      steps: ['从快速入口或主窗口打开 Awake。', '选择保持唤醒的时长，或选择持续保持直到主动关闭。', '检查当前状态与剩余时间，任务完成后关闭保持唤醒。'],
      boundary: ['Awake 的状态与到期由系统端管理，不依赖网页或界面倒计时保持运行。', 'Awake 的防休眠操作在本机执行，不需要联网。系统电源策略仍可能影响实际行为。', '退出 Awake 会停止保持唤醒，Zero 仍可继续运行并使用其他工具。'],
    },
    paper: {
      title: 'Zero Paper：Bing 桌面壁纸', description: '通过 Zero Paper 浏览 Bing 壁纸并更换桌面，了解图片获取所需网络以及平台间的壁纸应用差异。',
      steps: ['打开 Paper，查看壁纸预览及显示的来源、日期。', '选择喜欢的壁纸，在应用前确认预览。', '执行更换壁纸；若获取失败，检查网络后重试。'],
      boundary: ['获取新的 Bing 壁纸需要联网。已有预览缓存不代表任意壁纸都能离线获取。', '壁纸设置使用系统能力，具体应用方式依平台而异。', '图片来源为 Bing。Zero 开源代码的许可不等于壁纸图片的使用许可。'],
    },
    file: {
      title: 'Zero File：本地文档转换开发进度', description: '了解 Zero File 的本地文档转换方向和当前交付边界：File 属于开发配置，尚未进入 standard 试用包。',
      steps: ['先确认下载页所列的工具配置；standard 只有四个工具，不包含 File。', '需要了解文档转换时，阅读离线引擎指南与项目开发记录。', '等待经过批准并公开的发行说明，再按实际包能力选择使用。'],
      boundary: ['File 仍属于开发配置，签名引擎候选尚未获发行批准；官网不提供 File 安装包。', 'macOS debug 构建已有合成文档转换与离线 OCR 证据，不代表所有文档的版式保真、Windows 设备或签名安装包均已验收。', '文档转换设计为本地处理。官网本身不接收或转换文件。'],
    },
  },
  en: {
    snap: {
      title: 'Zero Snap: screenshots and annotation', description: 'Learn how Zero Snap captures, annotates and copies screen content, with custom capture on macOS and the system screenshot tool on Windows.',
      steps: ['Choose Snap from the Zero quick panel or main window.', 'On macOS, select the screen region, annotate it in the screenshot editor, then copy the result.', 'On Windows, follow the capture and editing workflow offered by the system screenshot tool that opens.'],
      boundary: ['macOS uses the Zero capture and editing interface. Windows opens the system screenshot tool; the editing surfaces and features differ.', 'Screen capture may require system permission. Check the authorization in system settings and retry if prompted.', 'Offline OCR has macOS development-build evidence. This does not establish that a trial installer includes OCR; check the public package notes.'],
    },
    launch: {
      title: 'Zero Launch: find and open applications', description: 'Find applications by name or pinyin with Zero Launch. Learn its default shortcuts and the differences in macOS and Windows app discovery.',
      steps: ['Open Zero Launch and enter an application name or pinyin.', 'Review the matching results and choose the application to open.', 'Check the current shortcut and system conflicts in settings. The defaults are Option + Space on macOS and Ctrl + Alt + Space on Windows.'],
      boundary: ['Launch searches local applications, rather than the web or file contents. App discovery sources depend on the operating system.', 'The default shortcuts have source and automated checks; physical global shortcuts and system indexing still have device acceptance tasks. Availability depends on the system configuration.', 'System app-search entries depend on packaging. Development builds, profiles and absent tools follow their corresponding package notes.'],
    },
    awake: {
      title: 'Zero Awake: keep your computer awake', description: 'Keep your computer awake during presentations, downloads and long tasks. Choose a duration, inspect the status and stop when the work is done.',
      steps: ['Open Awake from the quick panel or main window.', 'Choose a duration or keep the computer awake until you stop it.', 'Check the state and remaining time, then stop keeping the computer awake when the task finishes.'],
      boundary: ['The native host owns the Awake state and expiry. Keeping the computer awake does not depend on a webpage or UI countdown.', 'Awake runs locally without a network connection. System power policies may still affect behavior.', 'Exiting Awake ends its keep-awake session; Zero can continue running with its other tools.'],
    },
    paper: {
      title: 'Zero Paper: Bing desktop wallpapers', description: 'Browse Bing wallpapers and refresh your desktop with Zero Paper. Learn which operations need a network and how wallpaper application varies by platform.',
      steps: ['Open Paper and inspect the wallpaper preview, source and date.', 'Choose a wallpaper and confirm its preview before applying it.', 'Apply the wallpaper. If retrieval fails, check the network and retry.'],
      boundary: ['Retrieving new Bing wallpapers requires a network connection. Cached previews do not make every wallpaper available offline.', 'Wallpaper application uses system facilities and differs by platform.', 'Bing provides the images. The Zero source-code license does not grant a license to the wallpaper images.'],
    },
    file: {
      title: 'Zero File: local document conversion in development', description: 'Understand the current delivery boundaries of Zero File: local document conversion is in development and is not included in the standard trial package.',
      steps: ['Check the tool configuration on the download page. Standard contains four tools and excludes File.', 'Read the offline-engine guide and project records to learn about document conversion.', 'Wait for approved public release notes and choose based on the capabilities of the actual package.'],
      boundary: ['File belongs to the development configuration. Its signed engine candidate has not been approved for release; this website provides no File installer.', 'Synthetic conversion and offline OCR have macOS debug evidence. This does not establish layout fidelity for all documents, Windows device acceptance or signed-installer acceptance.', 'Document conversion is designed for local processing. This website does not accept or convert files.'],
    },
  },
};

export function releaseSummary(locale: Locale) {
  return catalog.packages.length ? copy[locale].acquisition.releaseAnswer : (copy[locale].faq.items[0]?.answer ?? copy[locale].download.unavailableText);
}

function toolDocument(locale: Locale, slug: ToolSlug): ProductDocument {
  const detail = details[locale][slug];
  const tool = copy[locale].tools.items.find((item) => item.id === `zero.${slug}`);
  const zh = locale === 'zh';
  return {
    page: `tools/${slug}`, title: detail.title, description: detail.description,
    sections: [
      { id: 'purpose', heading: zh ? '它能做什么' : 'What it does', paragraphs: tool ? [tool.description, tool.scenario, tool.platform] : [copy[locale].file.text] },
      { id: 'use', heading: zh ? '如何使用' : 'How to use it', paragraphs: [], steps: detail.steps },
      { id: 'boundaries', heading: zh ? '平台与当前边界' : 'Platforms and current boundaries', paragraphs: detail.boundary },
      { id: 'availability', heading: zh ? '如何获取' : 'How to get it', paragraphs: [releaseSummary(locale), slug === 'file' ? copy[locale].file.text : copy[locale].download.standardText] },
    ],
    sources: [
      { title: 'GitHub · Zero', url: links.github },
      { title: zh ? '试用打包说明' : 'Trial packaging notes', url: links.trial },
      ...(slug === 'file' ? [{ title: zh ? 'File 离线引擎指南' : 'File offline-engine guide', url: `${links.github}/blob/main/docs/plugins/zero-file-offline-engines.md` }] : []),
    ],
  };
}

function installationDocument(locale: Locale): ProductDocument {
  const zh = locale === 'zh';
  return {
    page: 'guide/install', title: zh ? 'Zero 安装与试用指南' : 'Zero installation and trial guide',
    description: zh ? '选择 Zero 的 macOS 或 Windows 配置，核对架构、SHA-256 与签名状态，了解公开下载、Actions 试用及升级替换条件。' : 'Choose the right Zero platform and profile, verify architecture, SHA-256 and signing state, and understand public downloads, Actions trials and upgrades.',
    sections: [
      { id: 'availability', heading: zh ? '先确认当前发行状态' : 'Check release availability first', paragraphs: [releaseSummary(locale), zh ? '下载页以维护中的公开发行清单为准。没有适合你的公开包时，请查看试用说明；不要把草稿 Release 或 Actions 临时产物当作正式发行。' : 'The download page follows the maintained public-release catalog. If no suitable public package exists, use the trial notes; draft releases and temporary Actions artifacts are not ordinary public releases.'] },
      { id: 'choose', heading: zh ? '选择平台、架构与配置' : 'Choose a platform, architecture and profile', paragraphs: [`standard — ${copy[locale].download.standardText}`, `core — ${copy[locale].download.coreText}`, copy[locale].download.file], steps: zh ? ['macOS：根据本机处理器选择 Apple Silicon 或 Intel，使用对应 DMG。', 'Windows：核对 x64 与实际提供的 MSI / EXE 格式。', 'Linux、iOS 与 Android 当前没有对应应用安装包；手机可以浏览官网。'] : ['macOS: choose Apple Silicon or Intel for your processor and use the corresponding DMG.', 'Windows: verify x64 and the actual MSI or EXE offered.', 'There are currently no Linux, iOS or Android application installers. The website can be read on mobile devices.'] },
      { id: 'verify', heading: zh ? '下载后核对再安装' : 'Verify before installation', paragraphs: [copy[locale].download.note], steps: zh ? ['从下载页或项目官方发行入口获取文件，核对版本、profile、平台和架构。', '计算文件 SHA-256，与下载页或随包 SHA256SUMS.txt 中的对应值比较。macOS 可用 shasum -a 256，Windows 可用 PowerShell Get-FileHash -Algorithm SHA256。', '校验一致后再安装对应产物。遇到 Gatekeeper 或 SmartScreen 提示时，先确认来源和签名条件，再依据系统指引判断是否继续。'] : ['Use the download page or the official project release entry and check version, profile, platform and architecture.', 'Calculate SHA-256 and compare it with the download page or the matching entry in SHA256SUMS.txt. On macOS use shasum -a 256; on Windows use PowerShell Get-FileHash -Algorithm SHA256.', 'Install the matching artifact after verification. If Gatekeeper or SmartScreen warns, check the source and signing conditions before following system guidance.'] },
      { id: 'trial', heading: zh ? '没有公开包时如何试用' : 'Trial options before a public release', paragraphs: zh ? ['维护者可在 GitHub Actions 的 Package Zero 工作流中选择 profile 和目标构建。构建完成后，从对应 run 的 Artifacts 下载 ZIP，解压并核对 SHA256SUMS.txt。', 'Actions 产物可能需要 GitHub 登录，并会过期。工作流运行需要相应仓库权限；普通访客可阅读试用打包说明，或等待公开发行。构建成功不代表所有设备均已验收。'] : ['Maintainers can select a profile and targets in the GitHub Actions Package Zero workflow. Download the ZIP from the completed run artifacts, extract it and verify SHA256SUMS.txt.', 'Actions artifacts may require GitHub login and expire. Running the workflow requires repository permissions. Other visitors can read the trial packaging notes or wait for a public release. A successful build does not establish acceptance on every device.'] },
      { id: 'upgrade', heading: zh ? '升级与切换配置' : 'Upgrades and profile changes', paragraphs: zh ? ['core 和 standard 安装后都叫 Zero，共用应用身份与 ~/.zero 数据目录，应顺序替换安装，不能作为两个独立应用同时运行。', '切换配置会保留缺席工具的记录，当前包不展示这些工具。更换版本前先停止正在进行的任务；保留需要的数据并阅读对应版本说明。'] : ['Core and standard both install as Zero and share the application identity and ~/.zero data directory. Replace them sequentially; they are not separate applications that can run together.', 'Profile changes preserve records of absent tools while hiding them in the current package. Stop active tasks before replacing a version, keep needed data and read the release notes.'] },
    ],
    sources: [{ title: zh ? '试用打包说明' : 'Trial packaging notes', url: links.trial }, { title: 'GitHub Releases', url: links.releases }, { title: zh ? '报告安装问题' : 'Report an installation issue', url: links.issues }],
  };
}

function faqDocument(locale: Locale): ProductDocument {
  const zh = locale === 'zh';
  return {
    page: 'faq', title: zh ? 'Zero 常见问题：平台、联网与工具配置' : 'Zero FAQ: platforms, network use and tool profiles',
    description: zh ? 'Zero 是什么？能否下载、是否离线、core 和 standard 有何区别、File 和第三方插件何时可用？查看当前事实与来源。' : 'What is Zero? Find current answers about downloads, offline use, core versus standard, File and third-party plugins, with source references.',
    sections: [
      { id: 'identity', heading: zh ? 'Zero 是什么？' : 'What is Zero?', paragraphs: [copy[locale].description, zh ? 'Zero 是开源桌面工具箱，以状态栏或托盘提供快速入口，通过主窗口提供完整工具工作区。官网用于介绍、说明与获取信息，不在浏览器中执行原生工具操作。' : 'Zero is an open-source desktop toolbox with menu-bar or tray quick access and a full main-window workspace. This website provides product, usage and acquisition information; it does not execute native tools in the browser.'] },
      ...copy[locale].faq.items.map((item, index) => ({ id: ['download', 'platforms', 'profiles', 'network', 'plugins'][index] ?? `question-${index + 1}`, heading: item.question, paragraphs: [index === 0 ? releaseSummary(locale) : item.answer] })),
      { id: 'file', heading: zh ? 'File 和 OCR 已经能在试用包里使用吗？' : 'Are File and OCR available in the trial package?', paragraphs: [copy[locale].file.text, details[locale].snap.boundary[2]] },
      { id: 'support', heading: zh ? '遇到问题怎么反馈？' : 'How can I report a problem?', paragraphs: zh ? ['通过 GitHub Issues 反馈，说明版本、操作系统、工具、操作步骤与实际结果。Zero 的关于窗口提供支持诊断入口；分享前检查内容，不提交私有文件、凭据或屏幕中的个人信息。'] : ['Use GitHub Issues and include the version, operating system, tool, reproduction steps and actual result. The Zero About window offers support diagnostics. Review what you share and exclude private files, credentials and personal screen content.'] },
    ],
    sources: [{ title: zh ? '试用打包说明' : 'Trial packaging notes', url: links.trial }, { title: zh ? '插件协议当前状态' : 'Plugin protocol status', url: `${links.github}/blob/main/docs/plugins/protocol-v1.md` }, { title: 'GitHub Issues', url: links.issues }],
  };
}

export function documents(locale: Locale): ProductDocument[] {
  return [...toolSlugs.map((slug) => toolDocument(locale, slug)), installationDocument(locale), faqDocument(locale)];
}

export function documentLinks(locale: Locale) {
  return documents(locale).map((document) => ({ ...document, href: path(locale, document.page) }));
}
