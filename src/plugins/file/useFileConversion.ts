import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FileConversionBatchResult,
  FileConversionCandidate,
  FileConversionCapabilitySnapshot,
  FileConversionEnqueueItem,
  FileConversionError,
  FileConversionJobSnapshot,
  FileConversionQueueSnapshot,
  FileConversionDirection,
  FileConversionProviderId,
} from "./contracts";
import {
  mergeFileConversionQueueState,
  mergeFileConversionQueueStateJob,
  mergeFileConversionCapabilities,
  reconcileFileConversionCandidates,
} from "./fileModel";
import {
  fileService,
  normalizeFileConversionError,
} from "./fileService";

export type FileConversionAction =
  | "configuration"
  | "provider"
  | "choose"
  | "inspect"
  | "enqueue"
  | "start"
  | "cancel"
  | "remove"
  | "retry"
  | "clear"
  | "open"
  | "reveal";

export interface FileConversionActionError {
  action: FileConversionAction;
  owner: string | true;
  error: FileConversionError;
}

export interface FileConversionClient {
  getCapabilities(): Promise<FileConversionCapabilitySnapshot>;
  refreshCapabilities(): Promise<FileConversionCapabilitySnapshot>;
  chooseInputs(): Promise<FileConversionCandidate[]>;
  inspectInputs(sourcePaths: string[]): Promise<FileConversionCandidate[]>;
  enqueue(items: FileConversionEnqueueItem[]): Promise<FileConversionBatchResult>;
  getQueueSnapshot(): Promise<FileConversionQueueSnapshot>;
  subscribeQueue(handler: (snapshot: FileConversionQueueSnapshot) => void): Promise<() => void>;
  start(): Promise<FileConversionJobSnapshot[]>;
  cancel(jobId: string): Promise<FileConversionJobSnapshot[]>;
  remove(jobId: string): Promise<FileConversionJobSnapshot>;
  retry(jobId: string, providerId?: FileConversionProviderId): Promise<FileConversionJobSnapshot>;
  openConfiguration?(): Promise<void>;
  setProvider?(direction: FileConversionDirection, providerId: FileConversionProviderId, expectedRevision: number): Promise<FileConversionCapabilitySnapshot>;
  subscribeCapabilities?(handler: (snapshot: FileConversionCapabilitySnapshot) => void): Promise<() => void>;
  clearCompleted(): Promise<FileConversionJobSnapshot[]>;
  open(jobId: string): Promise<void>;
  reveal(jobId: string): Promise<void>;
  subscribe(
    handler: (snapshot: FileConversionJobSnapshot) => void,
  ): Promise<() => void>;
}

export function useFileConversion(
  client: FileConversionClient = fileService,
) {
  const [capabilities, setCapabilities] =
    useState<FileConversionCapabilitySnapshot | null>(null);
  const [candidates, setCandidates] = useState<FileConversionCandidate[]>([]);
  const [queue, setQueue] = useState<FileConversionQueueSnapshot>({ revision: -1, jobs: [] });
  const jobs = queue.jobs;
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<Partial<Record<FileConversionAction, string | true>>>({});
  const [error, setError] = useState<FileConversionError | null>(null);
  const [actionError, setActionError] =
    useState<FileConversionActionError | null>(null);
  const mountedRef = useRef(false);
  const actionGateRef = useRef(new Set<FileConversionAction>());

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let unlistenCapabilities: (() => void) | undefined;
    let unlistenQueue: (() => void) | undefined;
    const capabilitiesReady = client.subscribeCapabilities?.((snapshot) => {
      if (!disposed) setCapabilities((current) => mergeFileConversionCapabilities(current, snapshot));
    }).then((disposeListener) => {
      if (disposed) disposeListener();
      else unlistenCapabilities = disposeListener;
    }) ?? Promise.resolve();
    const jobsReady = client.subscribe((snapshot) => {
      if (disposed) return;
      setQueue((current) => mergeFileConversionQueueStateJob(current, snapshot));
    }).then((disposeListener) => {
      if (disposed) disposeListener();
      else unlisten = disposeListener;
    });
    const queueReady = client.subscribeQueue((snapshot) => {
      if (!disposed) setQueue((current) => mergeFileConversionQueueState(current, snapshot));
    }).then((disposeListener) => {
      if (disposed) disposeListener();
      else unlistenQueue = disposeListener;
    });
    Promise.all([capabilitiesReady, jobsReady, queueReady])
      .then(() => disposed ? undefined : Promise.all([client.getCapabilities(), client.getQueueSnapshot()]))
      .then((loaded) => {
        if (!loaded || disposed) return;
        const [nextCapabilities, snapshot] = loaded;
        setCapabilities((current) => mergeFileConversionCapabilities(current, nextCapabilities));
        setQueue((current) => mergeFileConversionQueueState(current, snapshot));
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!disposed) setError(normalizeFileConversionError(loadError));
      })
      .finally(() => {
        if (!disposed) setIsLoading(false);
      });

    return () => {
      disposed = true;
      mountedRef.current = false;
      actionGateRef.current.clear();
      unlisten?.();
      unlistenCapabilities?.();
      unlistenQueue?.();
    };
  }, [client]);

  const runAction = useCallback(
    async <T,>(
      action: FileConversionAction,
      owner: string | true,
      operation: () => Promise<T>,
    ): Promise<T | null> => {
      if (actionGateRef.current.has(action)) return null;
      actionGateRef.current.add(action);
      setBusy((current) => ({ ...current, [action]: owner }));
      setError(null);
      setActionError(null);
      try {
        return await operation();
      } catch (actionError) {
        if (mountedRef.current) {
          const normalized = normalizeFileConversionError(actionError);
          setError(normalized);
          setActionError({ action, owner, error: normalized });
        }
        return null;
      } finally {
        actionGateRef.current.delete(action);
        if (mountedRef.current) {
          setBusy((current) => {
            const next = { ...current };
            delete next[action];
            return next;
          });
        }
      }
    },
    [],
  );

  const choose = useCallback(async () => {
    const result = await runAction("choose", true, () => client.chooseInputs());
    if (result && mountedRef.current) {
      setCandidates((current) =>
        reconcileFileConversionCandidates(current, result),
      );
    }
    return result;
  }, [client, runAction]);

  const inspect = useCallback(
    async (sourcePaths: string[]) => {
      const result = await runAction("inspect", true, () =>
        client.inspectInputs(sourcePaths),
      );
      if (result && mountedRef.current) {
        setCandidates((current) =>
          reconcileFileConversionCandidates(current, result),
        );
      }
      return result;
    },
    [client, runAction],
  );

  const enqueue = useCallback(
    async (items: FileConversionEnqueueItem[]) => {
      const result = await runAction("enqueue", true, () => client.enqueue(items));
      if (result && mountedRef.current) {
        setQueue((current) =>
          result.jobs.reduce(mergeFileConversionQueueStateJob, current),
        );
        setCandidates(result.rejectedCandidates);
      }
      return result;
    },
    [client, runAction],
  );

  const start = useCallback(async () => {
    const result = await runAction("start", true, () => client.start());
    if (result && mountedRef.current) {
      setQueue((current) => result.reduce(mergeFileConversionQueueStateJob, current));
    }
    return result;
  }, [client, runAction]);

  const cancel = useCallback(
    async (jobId: string) => {
      const result = await runAction("cancel", jobId, () => client.cancel(jobId));
      if (result && mountedRef.current) {
        setQueue((current) => result.reduce(mergeFileConversionQueueStateJob, current));
      }
      return result;
    },
    [client, runAction],
  );

  const remove = useCallback(
    async (jobId: string) => {
      const result = await runAction("remove", jobId, () => client.remove(jobId));
      if (result && mountedRef.current) {
        setQueue((current) => ({ ...current, jobs: current.jobs.filter((job) => job.id !== jobId) }));
      }
      return result;
    },
    [client, runAction],
  );

  const retry = useCallback(
    async (jobId: string, providerId?: FileConversionProviderId) => {
      const result = await runAction("retry", jobId, () => client.retry(jobId, providerId));
      if (result && mountedRef.current) {
        setQueue((current) => mergeFileConversionQueueStateJob(current, result));
      }
      return result;
    },
    [client, runAction],
  );

  const openConfiguration = useCallback(() => runAction("configuration", true, () => client.openConfiguration?.() ?? Promise.resolve()), [client, runAction]);

  const setProvider = useCallback(async (direction: FileConversionDirection, providerId: FileConversionProviderId) => {
    if (!client.setProvider) return null;
    const result = await runAction("provider", true, () => client.setProvider!(direction, providerId, capabilities?.preferenceRevision ?? 0));
    if (result && mountedRef.current) setCapabilities((current) => mergeFileConversionCapabilities(current, result));
    if (!result && mountedRef.current) {
      try { const fresh = await client.getCapabilities(); if (mountedRef.current) setCapabilities((current) => mergeFileConversionCapabilities(current, fresh)); } catch { /* Preserve the original action error. */ }
    }
    return result;
  }, [client, capabilities?.preferenceRevision, runAction]);

  const clearCompleted = useCallback(async () => {
    const removed = await runAction("clear", true, () => client.clearCompleted());
    if (removed && mountedRef.current) {
      const removedIds = new Set(removed.map((job) => job.id));
      setQueue((current) => ({ ...current, jobs: current.jobs.filter((job) => !removedIds.has(job.id)) }));
    }
    return removed;
  }, [client, runAction]);

  const open = useCallback(
    (jobId: string) => runAction("open", jobId, () => client.open(jobId)),
    [client, runAction],
  );
  const reveal = useCallback(
    (jobId: string) => runAction("reveal", jobId, () => client.reveal(jobId)),
    [client, runAction],
  );

  return useMemo(
    () => ({
      capabilities,
      candidates,
      setCandidates,
      jobs,
      isLoading,
      busy,
      error,
      actionError,
      choose,
      inspect,
      enqueue,
      start,
      cancel,
      remove,
      retry,
      setProvider,
      openConfiguration,
      clearCompleted,
      open,
      reveal,
    }),
    [
      capabilities,
      candidates,
      jobs,
      isLoading,
      busy,
      error,
      actionError,
      choose,
      inspect,
      enqueue,
      start,
      cancel,
      remove,
      retry,
      setProvider,
      openConfiguration,
      clearCompleted,
      open,
      reveal,
    ],
  );
}

export type FileConversionController = ReturnType<typeof useFileConversion>;
