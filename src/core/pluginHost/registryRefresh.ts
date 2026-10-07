import type { PluginRegistrySnapshot } from "./protocol/contracts";

export function createRegistryRefresh(
  fetchSnapshot: () => Promise<PluginRegistrySnapshot>,
  apply: (snapshot: PluginRegistrySnapshot) => void,
) {
  let revision = -1;
  let disposed = false;
  let dirty = false;
  let pending: Promise<void> | null = null;
  function refresh(minimumRevision?: number): Promise<void> {
    if (disposed || (minimumRevision !== undefined && minimumRevision <= revision)) return Promise.resolve();
    dirty = true;
    if (pending) return pending;
    pending = (async () => {
      while (dirty && !disposed) {
        dirty = false;
        const snapshot = await fetchSnapshot();
        if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error("Invalid registry revision");
        if (!disposed && snapshot.revision >= revision) {
          revision = snapshot.revision;
          apply(snapshot);
        }
      }
    })().finally(() => { pending = null; });
    return pending;
  }
  return { refresh, dispose() { disposed = true; dirty = false; } };
}
