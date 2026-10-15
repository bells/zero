import { convertTimestampBatch, type BatchJobInput, type BatchValue } from '../../lib/web-tools/timestamp-batch';
import { fail, type JobResponse } from '../../lib/web-tools/contracts';
self.onmessage = (event: MessageEvent<BatchJobInput & { requestId: number }>) => {
  let result: JobResponse<BatchValue>['result'];
  try { result = convertTimestampBatch(event.data); } catch { result = fail('worker'); }
  self.postMessage({ requestId: event.data.requestId, result } satisfies JobResponse<BatchValue>);
};
