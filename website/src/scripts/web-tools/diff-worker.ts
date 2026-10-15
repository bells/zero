import { compareText } from '../../lib/web-tools/text-diff';
import { fail, type Result } from '../../lib/web-tools/contracts';
import type { DiffJobInput, DiffValue } from '../../lib/web-tools/text-diff-types';
self.onmessage = (event: MessageEvent<DiffJobInput & { requestId: number }>) => {
  const { requestId, before, after } = event.data;
  let result: Result<DiffValue>;
  try { result = compareText(before, after); } catch { result = fail('worker'); }
  self.postMessage({ requestId, result });
};
