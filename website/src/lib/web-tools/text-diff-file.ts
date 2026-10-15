import { fail, type Result } from './contracts.ts';
import { diffLimits } from './text-diff-types.ts';
import { validateDiffSource } from './text-diff-input.ts';
const signatures = [[0x25,0x50,0x44,0x46,0x2d], [0x89,0x50,0x4e,0x47], [0xff,0xd8,0xff], [0x50,0x4b,3,4], [0x50,0x4b,5,6], [0x50,0x4b,7,8], [0x47,0x49,0x46,0x38], [0xd0,0xcf,0x11,0xe0], [0x1f,0x8b], [0x7f,0x45,0x4c,0x46]];
export function decodeDiffFile(bytes: Uint8Array): Result<string> {
  if (bytes.byteLength > diffLimits.bytes) return fail('limit');
  if (signatures.some(signature => signature.every((byte, index) => bytes[index] === byte))) return fail('text-file');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return fail('text-file'); }
  const checked = validateDiffSource(text);
  return checked.ok ? { ok: true, value: text } : checked;
}
