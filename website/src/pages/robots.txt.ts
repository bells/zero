import type { APIRoute } from 'astro';
import { base } from '../content/site';
export const GET: APIRoute = () => new Response(import.meta.env.SITE_PREVIEW ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: https://www.usezero.cn${base}sitemap-index.xml\n`, { headers: { 'Content-Type': 'text/plain' } });
