import source from './plugin-market.json' with { type: 'json' };
import { z } from 'zod';
import type { Locale } from './site.ts';

const localized = z.object({ zh: z.string().min(1).max(2048), en: z.string().min(1).max(2048) }).strict();
const signature = z.object({ schemaVersion: z.literal(1), keyId: z.string().min(1), pluginId: z.string(),
  pluginVersion: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), signature: z.string().length(88) }).strict();
const githubUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && !url.search && !url.hash;
}, 'Expected an exact HTTPS GitHub URL');
const entry = z.object({ name: z.string(), version: z.string(), author: z.string(),
  repository: githubUrl, releaseUrl: githubUrl, downloadUrl: githubUrl.refine(value => value.endsWith('.zplugin')),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), publisherSignature: signature,
  permissions: z.array(z.string()), description: z.string().optional(), installedVersion: z.string().nullish(),
}).refine(value => value.publisherSignature.pluginId === value.name && value.publisherSignature.pluginVersion === value.version
  && value.publisherSignature.sha256 === value.sha256, 'Signature envelope must identify the exact package');
const tool = z.object({ name: z.string().regex(/^zero\.[a-z][a-z0-9-]*$/), displayName: z.string().min(1).max(128),
  version: z.string().regex(/^\d+\.\d+\.\d+$/), description: localized, unavailableReason: localized }).strict();
export const pluginMarketSchema = z.object({ schemaVersion: z.literal(1), plugins: z.array(entry).max(1000),
  catalog: z.array(tool).max(1000), updatedAt: z.string().optional() }).strict().superRefine((market, context) => {
  for (const group of [market.plugins, market.catalog]) {
    const ids = new Set<string>();
    for (const item of group) {
      if (ids.has(item.name)) context.addIssue({ code: 'custom', message: 'Duplicate market identity' });
      ids.add(item.name);
    }
  }
});
export const pluginMarket = pluginMarketSchema.parse(source);
export function pluginRows(locale: Locale) {
  return pluginMarket.catalog.map(tool => ({ ...tool, description: tool.description[locale],
    unavailableReason: tool.unavailableReason[locale], release: pluginMarket.plugins.find(entry => entry.name === tool.name) }));
}

export const pluginMarketCopy = {
  zh: { title: 'Zero 插件市场', description: '选择需要的桌面工具，查看独立版本、发布状态与安装方式。',
    intro: 'core 不预装工具。插件包发布后，可以在 Zero 内按需安装、停用和卸载。',
    pending: '暂不可安装', available: '已发布', download: '下载插件包', signature: '下载配套签名', release: '查看发布说明',
    stepsTitle: '在 Zero 中安装与卸载', steps: [
      '下载支持该插件的新 core 安装包，核对平台、版本和校验值。旧宿主 0.1.0 不会因市场更新而获得新能力。',
      '打开偏好设置 → 扩展管理，刷新市场，选择已发布且兼容的工具。',
      '查看权限并确认安装。只有安装与激活成功后，工具才会出现。',
      '用完可停用或卸载。卸载应移除工具代码与后台资源，保留个人配置；重启后不应自动装回。',
    ], offlineTitle: '从本地导入', offline: '同时下载 .zplugin 和配套签名，将签名保存为“插件包完整文件名.signature.json”，放在包旁边，再到扩展管理验证并安装。仅看到工具介绍不表示已有可用包。',
    getCore: '查看 core 下载', source: '查看市场索引', version: '初始版本', note: '工具包需要 Zero 宿主运行。File 的转换引擎仍需独立批准；macOS 与 Windows 功能差异以对应发布记录为准。',
  },
  en: { title: 'Zero plugin market', description: 'Choose desktop tools and check independent versions, release status and installation steps.',
    intro: 'Core has no preinstalled tools. Once packages are released, install, disable and uninstall tools inside Zero as needed.',
    pending: 'Not available', available: 'Released', download: 'Download package', signature: 'Download matching signature', release: 'Read release notes',
    stepsTitle: 'Install and uninstall in Zero', steps: [
      'Download a new core installer that supports the plugin. Check its platform, version and checksum. Existing host 0.1.0 cannot gain native capabilities from a market refresh.',
      'Open Preferences → Extensions, refresh the market and choose a released compatible tool.',
      'Review permissions and approve installation. The tool appears after successful installation and activation.',
      'Disable or uninstall when finished. Uninstall should remove tool code and background resources, retain personal configuration and remain uninstalled after restarting.',
    ], offlineTitle: 'Import a local package', offline: 'Download both the .zplugin archive and its matching signature. Save the signature beside the archive as “full-archive-filename.signature.json”, then validate and install in Extensions. A catalog listing alone does not mean a package is available.',
    getCore: 'View core downloads', source: 'View market index', version: 'Initial version', note: 'Packages run inside the Zero host. File engines still require separate approval. Check each release for the actual macOS and Windows feature differences.',
  },
};
