import rawCatalog from './releases.json' with { type: 'json' };
import { catalogSchema, type ToolId } from './catalog.ts';

export type Locale = 'zh' | 'en';
export const catalog = catalogSchema.parse(rawCatalog);
export const links = {
  github: 'https://github.com/bells/zero',
  releases: 'https://github.com/bells/zero/releases',
  trial: 'https://github.com/bells/zero/blob/main/docs/packaging.md',
  developer: 'https://github.com/bells/zero/blob/main/docs/plugins/developer-guide.md',
  issues: 'https://github.com/bells/zero/issues',
};
export const base = import.meta.env?.BASE_URL || '/';
export function path(locale: Locale, page = '', hash = '') {
  return `${base}${locale === 'en' ? 'en/' : ''}${page ? `${page}/` : ''}${hash ? `#${hash}` : ''}`;
}
export function asset(name: string) { return `${base}${name}`; }

export interface ToolCopy {
  id: ToolId;
  name: string;
  icon: string;
  action: string;
  description: string;
  scenario: string;
  platform: string;
}
export interface SiteCopy {
  title: string; description: string; skip: string;
  nav: { tools: string; workflow: string; download: string };
  hero: { eyebrow: string; first: string; second: string; intro: string; secondary: string; note: string; preview: string };
  acquisition: { available: string; unavailable: string; releaseAnswer: string };
  workflow: { eyebrow: string; title: string; intro: string; quick: string; full: string; quickText: string; fullText: string; caption: string; altMain: string; altTray: string };
  tools: { eyebrow: string; title: string; intro: string; select: string; items: ToolCopy[] };
  file: { tag: string; title: string; text: string; link: string };
  principles: { eyebrow: string; title: string; items: { title: string; text: string }[] };
  faq: { title: string; items: { question: string; answer: string }[] };
  closing: { title: string; text: string };
  footer: { note: string; docs: string; developer: string; issues: string };
  download: { eyebrow: string; title: string; intro: string; platform: string; configuration: string; standard: string; core: string; standardText: string; coreText: string; unavailableTitle: string; unavailableText: string; trial: string; releases: string; condition: string; checksum: string; verified: string; explicit: string; formats: string; file: string; note: string; package: string; unsigned: string; signed: string; adHoc: string; notarized: string };
  notFound: { title: string; text: string; back: string };
}

export const copy: Record<Locale, SiteCopy> = {
  zh: {
    title: 'Zero — 随手调用，展开做事', description: 'Zero 桌面工具箱：从状态栏的快速操作，到完整的工具工作区。截图、启动、防休眠与桌面壁纸，各就其位。', skip: '跳到主要内容',
    nav: { tools: '工具', workflow: '使用方式', download: '获取 Zero' },
    hero: { eyebrow: '你的桌面，少一点打断', first: '随手调用。', second: '展开做事。', intro: '截图、启动、防休眠、换壁纸。\n常用工具收在一处，需要时展开。', secondary: '看看工具', note: 'macOS / Windows · 开源桌面工具箱', preview: 'macOS 开发界面展示' },
    acquisition: { available: '下载 Zero', unavailable: '查看试用方式', releaseAnswer: '可在下载页选择已公开的平台、架构和工具配置。请先核对版本、安装条件与校验值。' },
    workflow: { eyebrow: '01 / 两种节奏，一个 Zero', title: '小事随手做。\n需要时，多一点空间。', intro: '快速入口不打断手头的事。完整工作区，让设置、状态和操作都有自己的位置。', quick: '快速入口', full: '完整工作区', quickText: '从状态栏或托盘直接进入工具，做完即走。', fullText: '打开主窗口，查看状态、调整选项，从容完成操作。', caption: 'macOS · v0.1.0 开发构建 · Awake 界面；截图包含开发版工具目录，standard 试用版不含 File。', altMain: 'macOS Zero 主窗口：Awake 圆盘、时长选项与工具侧栏', altTray: 'macOS Zero 托盘快速入口：一行工具图标与紧凑 Awake 控制' },
    tools: { eyebrow: '02 / 日常工具，各有所长', title: '为手头的事，\n选一个顺手的工具。', intro: '四个工具，四种具体用途。按自己的节奏开启，保持桌面清爽。', select: '选择工具介绍', items: [
      { id: 'zero.snap', name: 'Snap', icon: 'zero-snap', action: '捕获。标注。复制。', description: '把屏幕上的重点留下来，让沟通更直接。', scenario: '说明一个问题，分享一处细节。', platform: 'macOS：自定义截图与标注；Windows：打开系统截图工具。' },
      { id: 'zero.launch', name: 'Launch', icon: 'zero-launch', action: '搜到，就打开。', description: '用名称或拼音找到应用，把注意力留给正在做的事。', scenario: '从想起一个应用，到开始使用。', platform: 'macOS / Windows；应用来源与快捷键依平台区分。' },
      { id: 'zero.awake', name: 'Awake', icon: 'zero-awake', action: '保持唤醒，直到结束。', description: '演示、下载、长任务。选择时长，或保持到你主动关闭。', scenario: '电脑别睡，让这件事先做完。', platform: 'macOS / Windows；状态与到期由系统端管理。' },
      { id: 'zero.paper', name: 'Paper', icon: 'zero-paper', action: '换一张桌面风景。', description: '查看 Bing 壁纸，在熟悉的工作环境里留一点新鲜感。', scenario: '开始工作前，为桌面换个视角。', platform: '获取新壁纸需要联网；壁纸应用方式依平台而异。' },
    ] },
    file: { tag: '开发中 / 当前试用版未包含', title: '接下来，文档也有自己的位置。', text: 'Zero File 正在完善本地文档转换。它属于开发配置，尚未进入 standard 试用包；具体能力与发行进度以项目记录为准。', link: '查看开发进度' },
    principles: { eyebrow: '03 / 工具的分寸', title: '各就其位。\n留出你的工作空间。', items: [ { title: '入口轻，工作区完整', text: '随手操作留在快速入口。更丰富的选项，交给主窗口。' }, { title: '边界清楚', text: '本地操作与联网功能分开说明。功能差异，放在使用前就能看到的地方。' }, { title: '源码可查，持续完善', text: '实现、问题与开发记录公开在 GitHub。用具体进展说明现在能做什么。' } ] },
    faq: { title: '用之前，你可能想知道', items: [ { question: '现在可以下载吗？', answer: '目前 GitHub 尚无公开 Release。可查看试用打包说明与项目进度；官网不会提供尚未公开的安装包直链。' }, { question: 'macOS 和 Windows 的功能一样吗？', answer: '部分功能依平台不同。例如 Snap 在 macOS 提供自定义截图与编辑，在 Windows 打开系统截图工具。各平台安装与原生验证状态以项目记录为准。' }, { question: '四工具版和 core 有什么区别？', answer: 'standard 包含 Awake、Paper、Snap、Launch。core 不含内置工具，用于宿主试用与体积比较。两种配置共用应用身份和数据目录，不能作为两个独立应用同时运行。' }, { question: '使用时需要联网吗？', answer: 'Awake 等系统操作在本地执行；Paper 获取新壁纸、下载与查看更新需要联网。Zero 不是一个所有功能都完全离线的应用。' }, { question: '能安装第三方插件吗？', answer: '项目已有插件架构与开发协议，公开第三方运行时目前尚未开放。官网不提供在线插件安装。' } ] },
    closing: { title: '让工具顺手。让工作继续。', text: '从今天用得到的小事开始。' },
    footer: { note: 'Built for your desktop. Room for your work.', docs: '试用说明', developer: '开发指南', issues: '反馈问题' },
    download: { eyebrow: '获取 ZERO', title: '选对版本。\n再开始使用。', intro: '先选平台，再看配置。只提供已经核实的公开安装包；没有公开版本时，试用说明同样在这里。', platform: '操作系统', configuration: '工具配置', standard: 'standard / 四工具', core: 'core / 无内置工具', standardText: 'Awake · Paper · Snap · Launch。日常工具使用优先选择此配置。', coreText: '不含内置工具，用于宿主试用与体积比较。', unavailableTitle: '所选平台与配置尚无公开安装包。', unavailableText: '所选平台与配置暂时没有可用的公开版本。你可以先查看项目与试用说明；我们会在相应版本就绪后更新这里。', trial: '查看试用说明', releases: '查看 GitHub Releases', condition: '安装前请确认', checksum: 'SHA-256', verified: '目录核对日期', explicit: '请主动选择 Apple Silicon 或 Intel；网站不会猜测处理器，也不会自动下载。Linux 与手机可浏览官网，当前没有对应应用安装包。', formats: 'macOS：DMG · Windows：MSI / EXE（以实际产物为准）', file: 'File 尚未进入 standard 试用包。', note: '当前试用打包尚未接入开发者证书签名 / Apple 公证或 Windows Authenticode。Actions 产物可能需要登录、会过期；构建成功不等于该设备已验收。请先阅读项目安装说明。', package: '下载此安装包', unsigned: '未签名', signed: '已签名', adHoc: '本地 ad-hoc 签名，未公证', notarized: '已签名并公证' },
    notFound: { title: '这条路还没铺好。', text: '回到首页，找到你需要的工具与试用信息。', back: '回到首页' },
  },
  en: {
    title: 'Zero — Close at hand. Room to work.', description: 'A desktop toolbox with quick tray actions and a full workspace. Capture, launch, stay awake and refresh your wallpaper.', skip: 'Skip to content',
    nav: { tools: 'Tools', workflow: 'How it works', download: 'Get Zero' },
    hero: { eyebrow: 'A little less interruption', first: 'Close at hand.', second: 'Room to work.', intro: 'Capture. Launch. Stay awake. Change the view.\nEveryday tools, together when you need them.', secondary: 'Explore the tools', note: 'macOS / Windows · Open-source desktop toolbox', preview: 'macOS development interface preview' },
    acquisition: { available: 'Download Zero', unavailable: 'Explore the trial', releaseAnswer: 'Choose an available platform, architecture and tool configuration on the download page. Check its version, installation conditions and checksum before installing.' },
    workflow: { eyebrow: '01 / Two rhythms. One Zero.', title: 'Quick things, quickly.\nMore room when you need it.', intro: 'Quick access fits around your work. The full workspace gives options, status and actions a place of their own.', quick: 'Quick access', full: 'Full workspace', quickText: 'Reach a tool from the menu bar or tray, act, and carry on.', fullText: 'Open the main window to see status and work through the options.', caption: 'macOS · v0.1.0 development build · Awake interface. The screenshots show the development tool catalog; the standard trial excludes File.', altMain: 'macOS Zero main window with Awake status dial, duration options and tool sidebar', altTray: 'macOS Zero quick panel with one row of tool icons and compact Awake controls' },
    tools: { eyebrow: '02 / Everyday tools, each with a purpose', title: 'The right tool\nfor the thing at hand.', intro: 'Four tools for four everyday jobs. Turn them on at your pace and keep your desktop in order.', select: 'Choose a tool introduction', items: [
      { id: 'zero.snap', name: 'Snap', icon: 'zero-snap', action: 'Capture. Annotate. Copy.', description: 'Keep the important part of your screen and make your point clearly.', scenario: 'Explain a problem. Share a detail.', platform: 'macOS: custom capture and annotation. Windows: opens the system screenshot tool.' },
      { id: 'zero.launch', name: 'Launch', icon: 'zero-launch', action: 'Find it. Open it.', description: 'Find an app by name or pinyin and get back to what you came to do.', scenario: 'From thinking of an app to using it.', platform: 'macOS / Windows. App sources and shortcuts vary by platform.' },
      { id: 'zero.awake', name: 'Awake', icon: 'zero-awake', action: 'Stay awake. Finish the job.', description: 'Presentations, downloads and long tasks. Pick a duration or keep going until you stop.', scenario: 'Let the task finish before the computer sleeps.', platform: 'macOS / Windows. State and expiry are managed by the native host.' },
      { id: 'zero.paper', name: 'Paper', icon: 'zero-paper', action: 'A fresh view of your desktop.', description: 'Browse Bing wallpapers and bring a small change to a familiar workspace.', scenario: 'Start the day with another perspective.', platform: 'New wallpapers need a network connection. Applying them varies by platform.' },
    ] },
    file: { tag: 'In development / Not in the current trial', title: 'Next, a place for documents too.', text: 'Zero File is refining local document conversion. It belongs to the development configuration and is not in the standard trial package. Follow the project for capabilities and release progress.', link: 'Follow development' },
    principles: { eyebrow: '03 / A sense of proportion', title: 'Tools in their place.\nSpace for your work.', items: [ { title: 'Quick access. A complete workspace.', text: 'Keep quick actions close at hand. Give richer options room in the main window.' }, { title: 'Clear boundaries', text: 'Local operations and network features are explained separately. Platform differences are visible before you start.' }, { title: 'Open code. Ongoing work.', text: 'Implementation, issues and development notes live on GitHub. Concrete progress shows what is available today.' } ] },
    faq: { title: 'A few things before you start', items: [ { question: 'Can I download it now?', answer: 'There is no public GitHub Release yet. Read the trial packaging guide and follow the project; this site does not link directly to unpublished installers.' }, { question: 'Are macOS and Windows identical?', answer: 'Some features differ. Snap provides custom capture and editing on macOS and opens the system screenshot tool on Windows. Check project records for platform installation and native verification status.' }, { question: 'How do standard and core differ?', answer: 'Standard includes Awake, Paper, Snap and Launch. Core has no bundled tools and is intended for host trials and size comparison. They share the same app identity and data directory and cannot run as independent apps together.' }, { question: 'Does it need the internet?', answer: 'System operations such as Awake run locally. Fetching new Paper wallpapers, downloads and checking update information need a connection. Not every feature is entirely offline.' }, { question: 'Can I install third-party plugins?', answer: 'The project has a plugin architecture and developer protocol. The public third-party runtime is not open yet, and the website does not install plugins.' } ] },
    closing: { title: 'Tools that fit. Work that flows.', text: 'Start with the small things you need today.' },
    footer: { note: 'Built for your desktop. Room for your work.', docs: 'Trial guide', developer: 'Developer guide', issues: 'Report an issue' },
    download: { eyebrow: 'GET ZERO', title: 'The right version.\nA clear starting point.', intro: 'Choose your platform, then your tools. Only verified public installers are offered. Until a public release is ready, find the trial guide here.', platform: 'Operating system', configuration: 'Tool configuration', standard: 'standard / Four tools', core: 'core / No bundled tools', standardText: 'Awake · Paper · Snap · Launch. Choose this configuration for everyday tools.', coreText: 'No bundled tools. Intended for host trials and size comparison.', unavailableTitle: 'No public installer for this platform and configuration yet.', unavailableText: 'There is no public version for this platform and configuration yet. Explore the project and trial guide for now. This page will be updated when a matching package is ready.', trial: 'Read the trial guide', releases: 'View GitHub Releases', condition: 'Before installing', checksum: 'SHA-256', verified: 'Catalog checked on', explicit: 'Choose Apple Silicon or Intel explicitly; this site does not guess your processor or start downloads. Linux and phones can browse this site but have no application installer here.', formats: 'macOS: DMG · Windows: MSI / EXE (depending on actual assets)', file: 'File is not in the standard trial package.', note: 'Trial packaging has not added developer-certificate signing, Apple notarization or Windows Authenticode. Actions artifacts may require sign-in and expire; a successful build is not device acceptance. Read the installation guide first.', package: 'Download this installer', unsigned: 'Unsigned', signed: 'Signed', adHoc: 'Local ad-hoc signing, not notarized', notarized: 'Signed and notarized' },
    notFound: { title: 'This path is still taking shape.', text: 'Head home to find the tools and trial information you need.', back: 'Back to home' },
  },
};
