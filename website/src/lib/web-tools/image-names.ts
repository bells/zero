import type { ImageOutputFormat } from './image-contracts.ts';
export function imageDownloadNames(names: readonly string[], operation: 'convert' | 'watermark' | 'compress', formats: readonly ImageOutputFormat[]): string[] {
  const seen = new Set<string>();
  return names.map((name, i) => {
    let base = (name.split(/[\\/]/).pop() ?? '').normalize('NFC').replace(/\.[^.]*$/, '').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/^[. ]+|[. ]+$/g, '');
    base = [...base].slice(0, 60).join('') || 'image';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `_${base}`;
    const ext = formats[i] === 'jpeg' ? 'jpg' : formats[i] === 'webp' ? 'webp' : 'png';
    let suffix = 1, result = `${base}-${operation}.${ext}`;
    while (seen.has(result.toLocaleLowerCase('en-US'))) result = `${base}-${operation}-${++suffix}.${ext}`;
    seen.add(result.toLocaleLowerCase('en-US')); return result;
  });
}
