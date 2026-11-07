import assert from "node:assert/strict";
import test from "node:test";
import {
  fileConversionDirectionKey,
  fileConversionJobActions,
  fileConversionProviderGuidance,
  fileConversionQueueActions,
  mergeFileConversionJob,
  planFileConversionIntake,
  reconcileFileConversionCandidates,
  reconcileInitialFileConversionJobs,
  summarizeFileConversionJob,
} from "/private/tmp/zero-tests/plugins/file/fileModel.js";

function job(id, updatedAtMs, status = "queued") {
  return {
    id,
    sourcePath: `/tmp/${id}.pdf`,
    sourceName: `${id}.pdf`,
    sizeBytes: 10,
    direction: "pdfToDocx",
    targetName: `${id}-converted.docx`,
    createdAtMs: 1,
    updatedAtMs,
    state: { status },
  };
}

test("mount reconciliation applies buffered events after the authoritative list snapshot", () => {
  const reconciled = reconcileInitialFileConversionJobs(
    [job("one", 10), job("two", 10)],
    [job("one", 12, "preparing"), job("three", 11)],
  );

  assert.deepEqual(reconciled.map((item) => [item.id, item.state.status]), [
    ["one", "preparing"],
    ["two", "queued"],
    ["three", "queued"],
  ]);
});

test("stale events cannot move a job backwards", () => {
  const current = [job("one", 20, "completed")];
  assert.equal(mergeFileConversionJob(current, job("one", 19, "running")), current);
});

const capabilities = {
  refreshedAtMs: 1,
  directions: [
    {
      direction: "pdfToDocx",
      available: false,
      providers: [],
      unavailability: {
        code: "engineUnavailable",
        message: "No approved provider.",
        retryable: true,
      },
    },
    {
      direction: "docxToPdf",
      available: true,
      selectedProviderId: "libreOffice",
      providers: [
        {
          id: "libreOffice",
          displayName: "LibreOffice",
          directions: ["docxToPdf"],
          availability: { kind: "available" },
        },
      ],
    },
  ],
};

test("direction labels and candidate reconciliation stay deterministic", () => {
  assert.equal(fileConversionDirectionKey("pdfToDocx"), "direction.pdfToDocx");
  const original = {
    sourcePath: "/tmp/a.pdf",
    sourceName: "a.pdf",
    validation: { status: "rejected", error: { code: "invalidInput" } },
  };
  const replacement = {
    ...original,
    validation: {
      status: "valid",
      direction: "pdfToDocx",
      proposedOutputName: "a-converted.docx",
    },
  };
  const added = {
    ...replacement,
    sourcePath: "/tmp/b.pdf",
    sourceName: "b.pdf",
  };
  assert.deepEqual(
    reconcileFileConversionCandidates([original], [replacement, added]),
    [replacement, added],
  );
});

test("mixed intake queues only valid candidates and never carries a start intent", () => {
  const valid = {
    sourcePath: "/tmp/报告.pdf",
    sourceName: "报告.pdf",
    validation: {
      status: "valid",
      direction: "pdfToDocx",
      proposedOutputName: "报告-converted.docx",
    },
  };
  const rejected = {
    sourcePath: "/tmp/notes.txt",
    sourceName: "notes.txt",
    validation: {
      status: "rejected",
      error: {
        code: "unsupportedFormat",
        message: "unsupported",
        retryable: false,
      },
    },
  };
  const plan = planFileConversionIntake([valid, rejected]);
  assert.deepEqual(plan, {
    enqueueItems: [{ sourcePath: "/tmp/报告.pdf" }],
    rejectedCandidates: [rejected],
  });
  assert.equal("start" in plan, false);
});

test("job and batch action eligibility follows native state boundaries", () => {
  const queued = job("queued", 1);
  const running = {
    ...job("running", 2),
    state: {
      status: "running",
      progress: { kind: "indeterminate", stage: "converting" },
    },
  };
  const failed = {
    ...job("failed", 3),
    state: {
      status: "failed",
      error: { code: "timeout", message: "Timed out", retryable: true },
    },
  };
  const completed = {
    ...job("completed", 4),
    state: {
      status: "completed",
      result: {
        outputPath: "/tmp/completed.docx",
        outputName: "completed.docx",
        sizeBytes: 12,
        completedAtMs: 4,
      },
    },
  };

  assert.deepEqual(fileConversionJobActions(queued), {
    canCancel: true,
    canRemove: true,
    canRetry: false,
    canOpen: false,
    canReveal: false,
  });
  assert.equal(fileConversionJobActions(running).canRemove, false);
  assert.equal(fileConversionJobActions(failed).canRetry, true);
  assert.deepEqual(fileConversionQueueActions([queued], capabilities), {
    canStart: false,
    canClearCompleted: false,
  });
  const convertible = { ...queued, direction: "docxToPdf" };
  assert.deepEqual(fileConversionQueueActions([convertible, completed], capabilities), {
    canStart: true,
    canClearCompleted: true,
  });
});

test("provider guidance and tray/main summaries expose truthful detail", () => {
  assert.deepEqual(fileConversionProviderGuidance(capabilities, "docxToPdf"), {
    available: true,
    direction: "docxToPdf",
    providerId: "libreOffice",
    providerName: "LibreOffice",
  });
  const unavailable = summarizeFileConversionJob(
    job("paper", 2),
    capabilities,
    "tray",
  );
  assert.equal(unavailable.stateKey, "state.engineUnavailable");
  assert.equal(unavailable.showDetails, false);

  const running = {
    ...job("report", 3),
    direction: "docxToPdf",
    providerId: "libreOffice",
    state: {
      status: "running",
      progress: { kind: "percentage", stage: "converting", percent: 42 },
    },
  };
  const summary = summarizeFileConversionJob(running, capabilities, "main");
  assert.equal(summary.stageKey, "stage.converting");
  assert.equal(summary.percent, 42);
  assert.equal(summary.providerName, "LibreOffice");
  assert.equal(summary.showDetails, true);
});


test("job revisions reject late events even when timestamps are equal", async () => {
  const { mergeFileConversionJob, mergeFileConversionCapabilities } = await import("/private/tmp/zero-tests/plugins/file/fileModel.js");
  const current = { id: "one", revision: 4, updatedAtMs: 100, providerId: "libreOffice" };
  const late = { ...current, revision: 3, providerId: "microsoftWordMacos" };
  assert.deepEqual(mergeFileConversionJob([current], late), [current]);
  const capability = { directions: [], preferenceRevision: 4, refreshedAtMs: 100 };
  assert.equal(mergeFileConversionCapabilities(capability, { ...capability, preferenceRevision: 3, refreshedAtMs: 200 }), capability);
});

test("queue snapshots remove rows without allowing late events to resurrect them", async () => {
  const { mergeFileConversionQueueSnapshot, mergeFileConversionQueueJob } = await import("/private/tmp/zero-tests/plugins/file/fileModel.js");
  const old = { id: "removed", revision: 2, queueRevision: 5, updatedAtMs: 10 };
  const future = { id: "new", revision: 1, queueRevision: 7, updatedAtMs: 11 };
  assert.deepEqual(mergeFileConversionQueueSnapshot([old, future], { revision: 6, jobs: [] }), [future]);
  assert.deepEqual(mergeFileConversionQueueJob([], old, 6), []);
  assert.deepEqual(mergeFileConversionQueueJob([], future, 6), [future]);
});


test("an authoritative snapshot cannot replace newer row state or revive removed membership", async () => {
  const { mergeFileConversionQueueState, mergeFileConversionQueueStateJob } = await import("/private/tmp/zero-tests/plugins/file/fileModel.js");
  const old = { ...job("one", 10), revision: 1, queueRevision: 1 };
  const running = { ...old, revision: 3, queueRevision: 3, state: { status: "running" } };
  const current = { revision: 2, jobs: [running] };
  const late = mergeFileConversionQueueState(current, { revision: 2, jobs: [old] });
  assert.deepEqual(late.jobs, [running]);
  const removed = mergeFileConversionQueueState(late, { revision: 4, jobs: [] });
  assert.deepEqual(removed, { revision: 4, jobs: [] });
  assert.equal(mergeFileConversionQueueState(removed, { revision: 2, jobs: [old] }), removed);
  assert.equal(mergeFileConversionQueueStateJob(removed, running), removed);
  const newJob = { ...job("new", 11), revision: 1, queueRevision: 5 };
  assert.deepEqual(mergeFileConversionQueueStateJob(removed, newJob).jobs, [newJob]);
});


test("mount hydration and cross-window clear converge for every delivery order", async () => {
  const { mergeFileConversionQueueState, mergeFileConversionQueueStateJob } = await import("/private/tmp/zero-tests/plugins/file/fileModel.js");
  const queued = { ...job("one", 10), revision: 0, queueRevision: 1 };
  const completed = { ...queued, revision: 2, queueRevision: 2, state: { status: "completed" } };
  const events = [
    (state) => mergeFileConversionQueueState(state, { revision: 1, jobs: [queued] }),
    (state) => mergeFileConversionQueueStateJob(state, completed),
    (state) => mergeFileConversionQueueState(state, { revision: 3, jobs: [] }),
  ];
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    const final = order.reduce((state, index) => events[index](state), { revision: -1, jobs: [] });
    assert.deepEqual(final, { revision: 3, jobs: [] }, `delivery order ${order}`);
  }
});
