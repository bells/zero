export interface TrayLayoutSession { session: number; maxHeight: number }
export interface TrayLayoutRequest { session: number; generation: number; desiredHeight: number }
export interface TrayLayoutSnapshot { generation: number; appliedHeight: number; maxHeight: number }
export interface TrayLayoutError { code: string; message: string }

export function createTrayLayoutQueue(send: (height: number, generation: number) => Promise<unknown>) {
  let disposed = false;
  let inFlight = false;
  let pending: number | undefined;
  let last = 0;
  let generation = 0;
  const drain = () => {
    if (disposed || inFlight || pending === undefined) return;
    const height = pending;
    pending = undefined;
    last = height;
    inFlight = true;
    void send(height, ++generation).catch(() => undefined).finally(() => {
      inFlight = false;
      drain();
    });
  };
  return {
    measure(height: number) {
      if (disposed || !Number.isFinite(height) || height <= 0) return;
      if (Math.abs(height - (pending ?? last)) < 1) return;
      pending = height;
      drain();
    },
    dispose() { disposed = true; pending = undefined; },
  };
}
