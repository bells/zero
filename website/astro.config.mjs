import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

const base = process.env.SITE_BASE || '/';
export default defineConfig({
  site: 'https://www.usezero.cn',
  base,
  trailingSlash: 'always',
  output: 'static',
  integrations: [sitemap({
    i18n: { defaultLocale: 'zh', locales: { zh: 'zh-CN', en: 'en' } },
    filter: (page) => !page.includes('/404') && !/\/llms(?:-full)?\.txt\/?$/.test(page),
  })],
  vite: {
    // The browser entry uses document; the portable entry also works in module Workers.
    resolve: { alias: { 'decode-named-character-reference': fileURLToPath(new URL('./node_modules/decode-named-character-reference/index.js', import.meta.url)) } },
    worker: { format: 'es' }, define: {
    'import.meta.env.SITE_PREVIEW': JSON.stringify(process.env.SITE_PREVIEW === '1' || process.env.VERCEL_ENV === 'preview'),
    'import.meta.env.VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV || ''),
  } },
});
