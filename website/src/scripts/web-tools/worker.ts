import { execute } from '../../lib/web-tools/execute';
import { fail, type Job, type JobResponse } from '../../lib/web-tools/contracts';
self.onmessage = (event: MessageEvent<Job>) => {
  let result: JobResponse['result'];
  try { result = execute(event.data); } catch { result = fail('worker'); }
  self.postMessage({ requestId: event.data.requestId, result } satisfies JobResponse);
};
