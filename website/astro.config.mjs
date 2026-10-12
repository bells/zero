import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const base = process.env.SITE_BASE || '/';
export default defineConfig({
  site: 'https://www.usezero.cn',
  base,
  trailingSlash: 'always',
  output: 'static',
  integrations: [sitemap({
    i18n: { defaultLocale: 'zh', locales: { zh: 'zh-CN', en: 'en' } },
    filter: (page) => !page.includes('/404'),
  })],
  vite: { define: { 'import.meta.env.SITE_PREVIEW': JSON.stringify(process.env.SITE_PREVIEW === '1') } },
});
