import { fail, limits, textFits, type Result, type UnicodeErrorReason, type UnicodeOperation } from './contracts.ts';

const high = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const low = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;
const hex = (unit: number) => '\\u' + unit.toString(16).toUpperCase().padStart(4, '0');
const fixed = (input: string, offset: number): number | undefined => {
  if (input.slice(offset, offset + 2) !== '\\u') return;
  const digits = input.slice(offset + 2, offset + 6);
  return /^[0-9a-fA-F]{4}$/.test(digits) ? Number.parseInt(digits, 16) : undefined;
};

function invalid(input: string, offset: number, unicodeReason: UnicodeErrorReason): Result<never> {
  let line = 1, column = 1;
  for (let index = 0; index < offset; index++) {
    if (input[index] === '\r') {
      if (input[index + 1] === '\n' && index + 1 < offset) index++;
      line++; column = 1;
    } else if (input[index] === '\n') { line++; column = 1; }
    else column++;
  }
  return fail('unicode', { unicodeReason, line, column });
}

export function transformUnicode(input: string, operation: UnicodeOperation, escapeAscii = false): Result<string> {
  if (!textFits(input)) return fail('limit');
  if (input.length === 0) return fail('empty');
  const chunks: string[] = [];
  let chunk = '', bytes = 0;
  const append = (text: string, byteLength: number) => {
    bytes += byteLength;
    if (bytes > limits.output) return false;
    chunk += text;
    if (chunk.length >= 8192) { chunks.push(chunk); chunk = ''; }
    return true;
  };
  for (let index = 0; index < input.length;) {
    const unit = input.charCodeAt(index);
    if (high(unit) ? !low(input.charCodeAt(index + 1)) : low(unit)) return invalid(input, index, 'surrogate');
    const width = high(unit) ? 2 : 1;
    const character = input.slice(index, index + width);
    const byteLength = width === 2 ? 4 : unit < 0x80 ? 1 : unit < 0x800 ? 2 : 3;
    if (operation === 'unicode-encode') {
      const escaped = escapeAscii || unit < 0x20 || unit >= 0x7f || unit === 0x5c;
      const text = escaped ? hex(unit) + (width === 2 ? hex(input.charCodeAt(index + 1)) : '') : character;
      if (!append(text, escaped ? text.length : byteLength)) return fail('limit');
      index += width;
      continue;
    }
    if (unit === 0x5c && input[index + 1] === '\\') {
      if (!append('\\\\', 2)) return fail('limit');
      index += 2;
      continue;
    }
    if (unit !== 0x5c || input[index + 1] !== 'u') {
      if (!append(character, byteLength)) return fail('limit');
      index += width;
      continue;
    }
    let codepoint: number, length: number;
    if (input[index + 2] === '{') {
      // A bounded lookahead also rejects missing braces without scanning the remaining document.
      const match = /^\{([0-9a-fA-F]{1,6})\}/.exec(input.slice(index + 2, index + 11));
      if (!match?.[1]) return invalid(input, index, 'escape');
      codepoint = Number.parseInt(match[1], 16);
      length = match[0].length + 2;
      if (codepoint > 0x10ffff || high(codepoint) || low(codepoint)) return invalid(input, index, 'codepoint');
    } else {
      const first = fixed(input, index);
      if (first === undefined) return invalid(input, index, 'escape');
      codepoint = first; length = 6;
      if (high(first)) {
        const second = fixed(input, index + 6);
        if (second === undefined || !low(second)) return invalid(input, index, 'surrogate');
        codepoint = 0x10000 + (first - 0xd800) * 0x400 + second - 0xdc00;
        length = 12;
      } else if (low(first)) return invalid(input, index, 'surrogate');
    }
    const decodedBytes = codepoint < 0x80 ? 1 : codepoint < 0x800 ? 2 : codepoint < 0x10000 ? 3 : 4;
    if (!append(String.fromCodePoint(codepoint), decodedBytes)) return fail('limit');
    index += length;
  }
  chunks.push(chunk);
  return { ok: true, value: chunks.join('') };
}
