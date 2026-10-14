import { fail, type Job, type JobResponse, type JobValue, type Result } from './contracts.ts';
export interface WorkerPort {
  onmessage: ((event: MessageEvent<JobResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(job: Job): void;
  terminate(): void;
}
export class JobRunner {
  private sequence = 0;
  private pending: { worker: WorkerPort; timer: ReturnType<typeof setTimeout>; resolve: (value: Result<JobValue>) => void } | undefined;
  private factory: () => WorkerPort;
  private timeout: number;
  constructor(factory: () => WorkerPort, timeout = 5000) { this.factory = factory; this.timeout = timeout; }
  cancel() {
    this.sequence++;
    const pending = this.pending;
    this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.worker.terminate(); pending.resolve(fail('cancelled')); }
  }
  run(input: Omit<Job, 'requestId'>): Promise<Result<JobValue>> {
    this.cancel();
    const requestId = this.sequence;
    return new Promise((resolve) => {
      let worker: WorkerPort;
      try { worker = this.factory(); } catch { resolve(fail('worker')); return; }
      const finish = (result: Result<JobValue>) => {
        if (requestId !== this.sequence || !this.pending) return;
        clearTimeout(this.pending.timer); this.pending = undefined; worker.terminate(); resolve(result);
      };
      const timer = setTimeout(() => finish(fail('timeout')), this.timeout);
      this.pending = { worker, timer, resolve };
      worker.onmessage = (event) => { if (event.data.requestId === requestId) finish(event.data.result); };
      worker.onerror = (event) => { event.preventDefault(); finish(fail('worker')); };
      try { worker.postMessage({ ...input, requestId }); } catch { finish(fail('worker')); }
    });
  }
}
