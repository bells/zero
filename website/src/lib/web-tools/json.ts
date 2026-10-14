import { applyEdits, createScanner, format, parseTree, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { fail, limits, textFits, type Result } from './contracts.ts';
export function transformJson(input: string, operation: 'format' | 'compact' | 'unwrap' | 'validate'): Result<string> {
  if (!textFits(input)) return fail('limit');
  const scanner = createScanner(input, true);
  let depth = 0;
  while (scanner.getPosition() < input.length) {
    scanner.scan();
    const first = input[scanner.getTokenOffset()];
    if (first === '{' || first === '[') depth++;
    if (depth > limits.depth) return fail('depth');
    if (first === '}' || first === ']') depth--;
  }
  const errors: ParseError[] = [];
  const tree = parseTree(input, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  const error = errors[0];
  if (error || !tree) {
    const offset = error?.offset ?? 0;
    const lines = input.slice(0, offset).split(/\r\n|\r|\n/);
    return fail('json', { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1, detail: error ? printParseErrorCode(error.error) : 'ValueExpected' });
  }
  let output = input;
  if (operation === 'format') output = applyEdits(input, format(input, undefined, { insertSpaces: true, tabSize: 2, eol: '\n' }));
  if (operation === 'compact') {
    const tokens: string[] = [];
    scanner.setPosition(0);
    while (scanner.getPosition() < input.length) {
      scanner.scan();
      tokens.push(input.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength()));
    }
    output = tokens.join('');
  }
  if (operation === 'unwrap') {
    if (tree.type !== 'string' || typeof tree.value !== 'string') return fail('unwrap');
    const decoded: string = tree.value;
    const valid = transformJson(decoded, 'validate');
    if (!valid.ok) return fail('unwrap');
    output = decoded;
  }
  return textFits(output, limits.output) ? { ok: true, value: output } : fail('limit');
}
