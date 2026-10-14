import { fail, limits, textFits, type Result } from './contracts.ts';
export function encodeBytes(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += 8192) chunks.push(String.fromCharCode(...bytes.subarray(start, start + 8192)));
  return btoa(chunks.join(''));
}
export function decodeBytes(input: string, maximum: number = limits.text): Result<Uint8Array> {
  const value = input.replace(/[\t\n\f\r ]/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1 || (value.includes('=') && value.length % 4 !== 0)) return fail('base64');
  if (Math.floor(value.replace(/=+$/, '').length * 3 / 4) > maximum) return fail('limit');
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (encodeBytes(bytes).replace(/=+$/, '') !== value.replace(/=+$/, '')) return fail('base64');
    return { ok: true, value: bytes };
  } catch { return fail('base64'); }
}
export function transformText(input: string, operation: 'base64-encode' | 'base64-decode' | 'url-encode' | 'url-decode'): Result<string> {
  if (!textFits(input)) return fail('limit');
  if (!input.isWellFormed()) return fail('utf8');
  let output: string;
  try {
    if (operation === 'base64-encode') output = encodeBytes(new TextEncoder().encode(input));
    else if (operation === 'base64-decode') {
      const bytes = decodeBytes(input);
      if (!bytes.ok) return bytes;
      try { output = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.value); } catch { return fail('utf8'); }
    } else output = operation === 'url-encode' ? encodeURIComponent(input) : decodeURIComponent(input);
  } catch { return fail('url'); }
  return textFits(output, limits.output) ? { ok: true, value: output } : fail('limit');
}
