# Zero Product

Updated: 2026-10-30 (Unicode catalog; other product boundaries retained). Implementation details and evidence belong in [the project overview](docs/project-overview.md); this document records product direction and design principles.

## Register

product

## 产品定位 / Product purpose

**Zero 是跨平台桌面工具箱，从状态栏 / 系统托盘快速使用各个独立可插拔的插件工具；官网提供无需安装、在浏览器本地处理内容的在线工具箱。**

**Zero is a cross-platform desktop toolbox with independent, pluggable tools available from the menu bar / system tray, complemented by a browser toolbox that processes content locally without installation.**

Desktop and web serve related needs through different surfaces. The desktop host owns native integration and plugin lifecycle. The independent website offers directly usable browser tools as well as product information and download guidance. A web tool is not automatically a desktop plugin, and sharing a brand does not imply shared runtime or feature parity.

## Users and jobs

- Desktop users want small native utilities close at hand: capture and annotate, stay awake, change wallpaper, launch an app or convert a document, then return to their work.
- Browser users want to open a URL and transform text, compare files, process images or write/export Markdown without installation or uploading their inputs to a computation service.
- Users need to understand platform limits, permissions, processing state and the actual result before trusting an action or download.

## Current product surfaces

| Surface | Role | Current scope |
| --- | --- | --- |
| Menu bar / system tray | Fast access and compact actions | Plugin entries, current state, quick controls and predictable dismissal |
| Main desktop window | Full tool workspace and preferences | Richer controls, preserved tool context, tool navigation and settings |
| Tool windows / native menus | Focused native workflows | Capture/pin, Launch, Paper and native Snap/Awake actions |
| About window | Product identity and support | Version, website/repository links and local diagnostics |
| Website | Product discovery and browser toolbox | Chinese/English product pages, download guidance and nine online tools |
| Optional feedback | User-submitted product feedback | Separate, click-loaded service; moderated plain text; disabled by default |

The five desktop tools are **Snap, Awake, Paper, Launch and File**. The nine browser tools are **timestamp conversion, JSON formatting, Base64/URL encoding, text/file comparison, Unicode escape conversion, image conversion, text watermarking, image compression and Markdown editing**. Browser categories are development, image and text.

## Independent, pluggable tools

Each desktop plugin should own its presentation, translations, domain logic and typed service boundary. The host provides shared navigation, lifecycle, preferences, shortcuts and status-bar coordination. Adding or refining one plugin should not require importing another plugin's implementation.

Current bundled modules are compiled into the host and can be selected by build profile; their native Rust capabilities are not dynamically loaded. Installed third-party packages have a separate manifest, permission and runtime boundary. Public Web Plugin API v1 is still under development with its release runtime disabled. Product language must preserve that distinction while retaining independent, pluggable tools as the desktop architecture and direction.

## Brand personality

Calm, capable, compact. Zero should feel practical, quiet and native-aware. Tool content and clear actions matter more than decoration. Chinese and English are first-class product languages.

## Design principles

- Keep tray actions fast and concise. A user should reach a familiar action without navigating a dashboard.
- Give the main window enough room for the task. Share behavior across surfaces without forcing full workflows into tray-sized layouts.
- Keep tool navigation, current content and system actions distinct. Preferences lives in the main window; About remains separate.
- Preserve native expectations for focus, shortcuts, menus, dismissal, window size and platform permissions.
- Make browser tools immediately understandable: input, action, result, copy/download, and an explicit error or cancellation path.
- Keep processing bounded and responsive. Heavy browser work uses cancellable workers; changing input must invalidate stale results.
- Prefer practical density, familiar controls and visible state over decorative panels. Never hide essential controls just to make a surface smaller.
- Reuse maintained libraries for generic capabilities and keep dependency, license and resource costs visible to maintainers.

## Privacy and truthful claims

Tool inputs are processed locally within their respective desktop/browser boundaries. This is not a blanket claim that the product never uses a network: Paper fetches Bing images, the plugin host can fetch approved packages, browser code/fonts/codecs load from the site, and explicitly authorized Markdown images contact their origins.

Browser input persistence is off by default; Markdown offers one opt-in local draft. Optional feedback sends only user-submitted feedback and allowed metadata to its independent service; it does not collect tool inputs/results. Service availability must not affect tool computation.

Describe source implementation, automated checks, real-device acceptance and public release separately. Desktop currently focuses on macOS/Windows with per-tool differences; Linux and mobile are not complete supported product targets. File's signed engine candidate and public third-party Web runtime remain gated. Real iPhone browser acceptance is distinct from responsive layout or Chrome emulation.

## Current priority

**下一阶段：由维护者重新体验五个桌面工具，再逐个优化一版。**

The next product pass is a hands-on review of all five desktop tools. Capture concrete friction, reproduce it, and make bounded improvements to entry points, interaction, feedback and stability. Keep the compact tray / full workspace distinction and validate the affected native workflow. This is a direction, not a claim that the review or its fixes have already happened.

Continue maintaining the website toolbox introduced during October 2026. Preserve its bilingual catalog, local processing, usable exports and honest device limits. Adding new tools or porting browser tools to desktop requires its own scoped decision and specification.

## Accessibility and anti-references

Target WCAG AA contrast, visible focus, keyboard operation, reduced motion, readable Chinese/English labels and practical touch/click targets. Responsive browser layouts do not establish native mobile support.

Avoid generic SaaS dashboards inside the desktop shell, oversized marketing blocks around a small browser task, unfamiliar controls that slow repeated work, and decorative system-monitor widgets unrelated to the plugin being used.
