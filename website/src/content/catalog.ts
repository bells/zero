import { z } from 'zod';

export const toolIds = ['zero.awake', 'zero.paper', 'zero.snap', 'zero.launch', 'zero.file'] as const;
export type ToolId = typeof toolIds[number];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const https = z.url().refine((value) => new URL(value).protocol === 'https:', 'HTTPS required');
const assetUrl = https.refine((value) => {
  const url = new URL(value);
  return url.origin === 'https://github.com' && /^\/bells\/zero\/releases\/download\/v[^/]+\/[^/]+$/.test(url.pathname) && !url.search && !url.hash;
}, 'Only exact public bells/zero release assets are allowed');
export const packageSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
  releasedAt: date,
  verifiedAt: date,
  channel: z.enum(['stable', 'trial']),
  visibility: z.literal('published'),
  profile: z.enum(['core', 'standard']),
  tools: z.array(z.enum(toolIds)),
  platform: z.enum(['macos', 'windows']),
  architecture: z.enum(['aarch64', 'x86_64']),
  format: z.enum(['dmg', 'msi', 'exe']),
  url: assetUrl,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  signing: z.enum(['unsigned', 'ad-hoc', 'signed', 'notarized']),
  source: https,
}).strict().superRefine((entry, ctx) => {
  const expected = entry.profile === 'core' ? [] : ['zero.awake', 'zero.paper', 'zero.snap', 'zero.launch'];
  if (entry.tools.length !== expected.length || new Set(entry.tools).size !== expected.length || expected.some((id) => !entry.tools.includes(id as ToolId))) {
    ctx.addIssue({ code: 'custom', message: 'Tools must match the declared build profile', path: ['tools'] });
  }
  if ((entry.platform === 'macos' && entry.format !== 'dmg') || (entry.platform === 'windows' && (entry.format === 'dmg' || entry.architecture !== 'x86_64' || entry.signing === 'ad-hoc' || entry.signing === 'notarized'))) {
    ctx.addIssue({ code: 'custom', message: 'Incompatible platform, architecture, installer or signing state' });
  }
  const url = new URL(entry.url);
  if (!url.pathname.startsWith(`/bells/zero/releases/download/v${entry.version}/`) || !decodeURIComponent(url.pathname).endsWith(`.${entry.format}`)) {
    ctx.addIssue({ code: 'custom', message: 'Asset version or format mismatch', path: ['url'] });
  }
});
export const catalogSchema = z.object({
  verifiedAt: date,
  source: z.literal('https://api.github.com/repos/bells/zero/releases'),
  state: z.enum(['published', 'unavailable']),
  packages: z.array(packageSchema),
}).strict().superRefine((catalog, ctx) => {
  if ((catalog.state === 'published') !== (catalog.packages.length > 0)) {
    ctx.addIssue({ code: 'custom', message: 'Release state must match public package availability' });
  }
  const keys = catalog.packages.map((p) => [p.version, p.profile, p.platform, p.architecture, p.format].join(':'));
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Duplicate package' });
});
export type PackageEntry = z.infer<typeof packageSchema>;
export type ReleaseCatalog = z.infer<typeof catalogSchema>;
export function packagesFor(catalog: ReleaseCatalog, platform: PackageEntry['platform'], profile: PackageEntry['profile']) {
  return catalog.packages.filter((entry) => entry.platform === platform && entry.profile === profile);
}
