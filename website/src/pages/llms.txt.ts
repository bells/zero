import type { APIRoute } from 'astro';
import { aiIndex } from '../content/ai-index';
import { isPreview } from '../content/site';
export const GET: APIRoute = () => new Response(isPreview ? '# Zero preview\n\nDiscovery index is disabled for this preview.\n' : aiIndex(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
