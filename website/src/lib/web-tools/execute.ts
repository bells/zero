import { fail, type ProcessorJob, type JobValue, type Result } from './contracts.ts';
import { transformJson } from './json.ts';
import { transformText } from './encoding.ts';
import { transformImage } from './image.ts';
import { transformUnicode } from './unicode.ts';
export function execute(job: ProcessorJob): Result<JobValue> {
  if (job.operation === 'image-encode' || job.operation === 'image-decode') return transformImage(job.input, job.mime);
  if (typeof job.input !== 'string') return fail('worker');
  const result = job.operation === 'unicode-encode' || job.operation === 'unicode-decode'
    ? transformUnicode(job.input, job.operation, job.escapeAscii)
    : job.operation === 'format' || job.operation === 'compact' || job.operation === 'validate' || job.operation === 'unwrap'
      ? transformJson(job.input, job.operation) : transformText(job.input, job.operation);
  return result.ok ? { ok: true, value: { text: result.value } } : result;
}
