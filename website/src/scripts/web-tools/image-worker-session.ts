import { parseImageMessage } from '../../lib/web-tools/image-contracts.ts';
import type { ImageErrorCode, ImageJobRequest, ImageWorkerMessage } from '../../lib/web-tools/image-contracts.ts';
export interface ImageWorkerPort {
 onmessage: ((event: MessageEvent<unknown>) => void) | null;
 onerror: ((event: ErrorEvent) => void) | null;
 postMessage(message: ImageJobRequest, transfer: Transferable[]): void;
 terminate(): void;
}
/** Owns one cancellable worker; callbacks from terminated sessions are ignored. */
export class ImageWorkerSession {
 private current: ImageWorkerPort | null = null;
 private timer: ReturnType<typeof setTimeout> | undefined;
 private readonly factory: () => ImageWorkerPort;
 constructor(factory: () => ImageWorkerPort) { this.factory=factory; }
 cancel(): void { const previous=this.current;this.current=null;clearTimeout(this.timer);previous?.terminate(); }
 start(request: ImageJobRequest, receive: (message: ImageWorkerMessage) => void, fail: (code: ImageErrorCode) => void): void {
  this.cancel();
  try {
   const port=this.factory();this.current=port;
   const current=()=>this.current===port;
   const failure=(code:ImageErrorCode)=>{if(!current())return;this.cancel();fail(code);};
   port.onmessage=event=>{if(!current())return;const message=parseImageMessage(event.data);if(!message){failure('worker');return;}if(message.jobId!==request.jobId||message.batchRevision!==request.batchRevision||message.itemId!==request.itemId)return;if(message.kind!=='progress')this.cancel();receive(message);};
   port.onerror=()=>failure('worker');this.timer=setTimeout(()=>failure('timeout'),request.policy.timeoutMs);
   port.postMessage(request,[request.bytes]);
  } catch { this.cancel();fail('worker'); }
 }
}
