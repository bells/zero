import type {
  FileConversionCandidate,
  FileConversionCapabilitySnapshot,
  FileConversionDirection,
  FileConversionDirectionCapability,
  FileConversionJobSnapshot,
  FileConversionQueueSnapshot,
  FileConversionProviderId,
  FileConversionProviderOrigin,
  FileConversionStage,
} from "./contracts";

export type FileConversionSurface = "tray" | "main";

export type FileConversionDirectionKey =
  | "direction.pdfToDocx"
  | "direction.docxToPdf";

export type FileConversionStageKey =
  | "stage.validating"
  | "stage.waitingForProvider"
  | "stage.converting"
  | "stage.finalizing";

export type FileConversionStateKey =
  | "state.queued"
  | "state.preparing"
  | "state.running"
  | "state.completed"
  | "state.failed"
  | "state.cancelled"
  | "state.engineUnavailable";

export interface FileConversionJobActions {
  canCancel: boolean;
  canRemove: boolean;
  canRetry: boolean;
  canOpen: boolean;
  canReveal: boolean;
}

export interface FileConversionQueueActions {
  canStart: boolean;
  canClearCompleted: boolean;
}

export interface FileConversionProviderGuidance {
  available: boolean;
  direction: FileConversionDirection;
  providerId?: FileConversionProviderId;
  providerName?: string;
  providerOrigin?: FileConversionProviderOrigin;
  errorCode?: string;
}

export interface FileConversionRowSummary {
  sourceName: string;
  targetName: string;
  directionKey: FileConversionDirectionKey;
  stateKey: FileConversionStateKey;
  stageKey?: FileConversionStageKey;
  percent?: number;
  providerName?: string;
  outputName?: string;
  showDetails: boolean;
  actions: FileConversionJobActions;
}

const DIRECTION_KEYS: Record<FileConversionDirection, FileConversionDirectionKey> = {
  pdfToDocx: "direction.pdfToDocx",
  docxToPdf: "direction.docxToPdf",
};

const STAGE_KEYS: Record<FileConversionStage, FileConversionStageKey> = {
  validating: "stage.validating",
  waitingForProvider: "stage.waitingForProvider",
  converting: "stage.converting",
  finalizing: "stage.finalizing",
};

export function fileConversionDirectionKey(
  direction: FileConversionDirection,
): FileConversionDirectionKey {
  return DIRECTION_KEYS[direction];
}

export function fileConversionStageKey(
  stage: FileConversionStage,
): FileConversionStageKey {
  return STAGE_KEYS[stage];
}

export function reconcileFileConversionCandidates(
  current: FileConversionCandidate[],
  incoming: FileConversionCandidate[],
): FileConversionCandidate[] {
  const next = [...current];
  for (const candidate of incoming) {
    const index = next.findIndex((item) => item.sourcePath === candidate.sourcePath);
    if (index < 0) {
      next.push(candidate);
    } else {
      next[index] = candidate;
    }
  }
  return next;
}

export function validFileConversionCandidateItems(
  candidates: FileConversionCandidate[],
) {
  return candidates.flatMap((candidate) =>
    candidate.validation.status === "valid"
      ? [{ sourcePath: candidate.sourcePath }]
      : [],
  );
}

export function planFileConversionIntake(
  candidates: FileConversionCandidate[],
) {
  return {
    enqueueItems: validFileConversionCandidateItems(candidates),
    rejectedCandidates: candidates.filter(
      (candidate) => candidate.validation.status === "rejected",
    ),
  };
}

export function fileConversionCapability(
  snapshot: FileConversionCapabilitySnapshot | null,
  direction: FileConversionDirection,
): FileConversionDirectionCapability | undefined {
  return snapshot?.directions.find((item) => item.direction === direction);
}

export function fileConversionProviderGuidance(
  snapshot: FileConversionCapabilitySnapshot | null,
  direction: FileConversionDirection,
): FileConversionProviderGuidance {
  const capability = fileConversionCapability(snapshot, direction);
  const provider = capability?.providers.find(
    (item) => item.id === (capability.preferredProviderId ?? capability.selectedProviderId),
  );
  return {
    available: capability?.available ?? false,
    direction,
    ...((capability?.preferredProviderId ?? capability?.selectedProviderId)
      ? { providerId: capability.preferredProviderId ?? capability.selectedProviderId }
      : {}),
    ...(provider ? { providerName: provider.displayName } : {}),
    ...(provider?.origin ? { providerOrigin: provider.origin } : {}),
    ...(capability?.unavailability
      ? { errorCode: capability.unavailability.code }
      : {}),
  };
}

export function fileConversionJobActions(
  job: FileConversionJobSnapshot,
): FileConversionJobActions {
  const { state } = job;
  const isActive = state.status === "preparing" || state.status === "running";
  return {
    canCancel: state.status === "queued" || isActive,
    canRemove: !isActive,
    canRetry:
      (state.status === "failed" || state.status === "cancelled") &&
      state.error.retryable && !["invalidInput", "unsupportedFormat", "passwordRequired", "invalidProviderOutput", "unsupportedInput"].includes(state.error.code),
    canOpen: state.status === "completed",
    canReveal: state.status === "completed",
  } satisfies FileConversionJobActions;
}

export function fileConversionQueueActions(
  jobs: FileConversionJobSnapshot[],
  capabilities: FileConversionCapabilitySnapshot | null,
): FileConversionQueueActions {
  return {
    canStart: jobs.some(
      (job) =>
        job.state.status === "queued" &&
        (job.providerId ? fileConversionCapability(capabilities, job.direction)?.providers.some((provider) => provider.id === job.providerId && provider.availability.kind === "available") === true : fileConversionCapability(capabilities, job.direction)?.available === true),
    ),
    canClearCompleted: jobs.some((job) => job.state.status === "completed"),
  };
}

export function fileConversionJobStateKey(
  job: FileConversionJobSnapshot,
  capabilities: FileConversionCapabilitySnapshot | null,
): FileConversionStateKey {
  if (
    job.state.status === "queued" &&
    (job.providerId
      ? fileConversionCapability(capabilities, job.direction)?.providers.find((provider) => provider.id === job.providerId)?.availability.kind !== "available"
      : fileConversionCapability(capabilities, job.direction)?.available === false)
  ) {
    return "state.engineUnavailable";
  }
  return `state.${job.state.status}` as FileConversionStateKey;
}

export function summarizeFileConversionJob(
  job: FileConversionJobSnapshot,
  capabilities: FileConversionCapabilitySnapshot | null,
  surface: FileConversionSurface,
): FileConversionRowSummary {
  const capability = fileConversionCapability(capabilities, job.direction);
  const provider = capability?.providers.find((item) => item.id === job.providerId);
  const state = job.state;
  const stage =
    state.status === "preparing"
      ? state.stage
      : state.status === "running"
        ? state.progress.stage
        : undefined;
  return {
    sourceName: job.sourceName,
    targetName: job.targetName,
    directionKey: fileConversionDirectionKey(job.direction),
    stateKey: fileConversionJobStateKey(job, capabilities),
    ...(stage ? { stageKey: fileConversionStageKey(stage) } : {}),
    ...(state.status === "running" && state.progress.kind === "percentage"
      ? { percent: state.progress.percent }
      : {}),
    ...(provider ? { providerName: provider.displayName } : {}),
    ...(state.status === "completed"
      ? { outputName: state.result.outputName }
      : {}),
    showDetails: surface === "main",
    actions: fileConversionJobActions(job),
  };
}

export function mergeFileConversionJob(
  jobs: FileConversionJobSnapshot[],
  update: FileConversionJobSnapshot,
): FileConversionJobSnapshot[] {
  const index = jobs.findIndex((job) => job.id === update.id);
  if (index < 0) {
    return [...jobs, update];
  }
  if ((jobs[index].revision ?? 0) > (update.revision ?? 0) || ((jobs[index].revision ?? 0) === (update.revision ?? 0) && jobs[index].updatedAtMs > update.updatedAtMs)) {
    return jobs;
  }
  const next = [...jobs];
  next[index] = update;
  return next;
}

export function reconcileInitialFileConversionJobs(
  snapshot: FileConversionJobSnapshot[],
  bufferedEvents: FileConversionJobSnapshot[],
): FileConversionJobSnapshot[] {
  return bufferedEvents.reduce(mergeFileConversionJob, snapshot);
}

export function mergeFileConversionCapabilities(current: FileConversionCapabilitySnapshot | null, update: FileConversionCapabilitySnapshot): FileConversionCapabilitySnapshot {
  if (!current) return update;
  const revision = current.preferenceRevision ?? 0;
  const incomingRevision = update.preferenceRevision ?? 0;
  return incomingRevision < revision || (incomingRevision === revision && ((update.capabilityRevision ?? 0) < (current.capabilityRevision ?? 0) || ((update.capabilityRevision ?? 0) === (current.capabilityRevision ?? 0) && update.refreshedAtMs < current.refreshedAtMs))) ? current : update;
}

export function mergeFileConversionQueueSnapshot(current: FileConversionJobSnapshot[], snapshot: FileConversionQueueSnapshot): FileConversionJobSnapshot[] {
  const future = current.filter((job) => (job.queueRevision ?? 0) > snapshot.revision);
  return future.reduce(mergeFileConversionJob, snapshot.jobs);
}

export function mergeFileConversionQueueJob(current: FileConversionJobSnapshot[], update: FileConversionJobSnapshot, snapshotRevision: number): FileConversionJobSnapshot[] {
  return update.queueRevision !== undefined && update.queueRevision <= snapshotRevision ? current : mergeFileConversionJob(current, update);
}


export function mergeFileConversionQueueState(
  current: FileConversionQueueSnapshot,
  snapshot: FileConversionQueueSnapshot,
): FileConversionQueueSnapshot {
  if (snapshot.revision < current.revision) return current;
  return { revision: snapshot.revision, jobs: mergeFileConversionQueueSnapshot(current.jobs, snapshot) };
}

export function mergeFileConversionQueueStateJob(
  current: FileConversionQueueSnapshot,
  update: FileConversionJobSnapshot,
): FileConversionQueueSnapshot {
  const jobs = mergeFileConversionQueueJob(current.jobs, update, current.revision);
  return jobs === current.jobs ? current : { ...current, jobs };
}
