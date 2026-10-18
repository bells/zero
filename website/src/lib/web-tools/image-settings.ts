import type { ImageResult, ImageSettings } from './image-contracts.ts';
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const range = (v: unknown, low: number, high: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
const color = (v: unknown) => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v);
export function validateImageSettings(settings: ImageSettings): ImageResult<ImageSettings> {
  const v: unknown = settings;
  const fail = { ok: false as const, error: { code: 'invalid' as const } };
  if (!record(v) || !['convert', 'compress', 'watermark'].includes(String(v.operation)) || !record(v.output)) return fail;
  const o = v.output;
  if (!['preserve', 'jpeg', 'png', 'webp'].includes(String(o.format)) || !range(o.quality, 1, 100) || !color(o.jpegBackground) || !(o.maxLongEdge === null || (range(o.maxLongEdge, 1, 8192) && Number.isInteger(o.maxLongEdge)))) return fail;
  if (v.operation === 'watermark') {
    const w = v.watermark;
    if (!record(w) || typeof w.text !== 'string' || !w.text.trim() || [...w.text].length > 200 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(w.text) || !color(w.color) || !range(w.fontRatio, .01, .2) || !range(w.opacity, 0, 1) || !range(w.rotation, -180, 180) || !range(w.marginRatio, 0, .25)) return fail;
    if (w.mode === 'single') { if (!['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'].includes(String(w.position))) return fail; }
    else if (w.mode !== 'tile' || !range(w.spacingRatio, .05, 1)) return fail;
  }
  return { ok: true, value: settings.operation === 'watermark' ? { ...settings, output: { ...settings.output }, watermark: { ...settings.watermark } } : { ...settings, output: { ...settings.output } } };
}
