import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FileConversionQualityProfile, FileConversionQualityIssue, FileFontInspection } from "../contracts";
import { aggregateQualityIssues, qualityIssue, QualityReportError } from "./qualityReport";
import { clearDocxRenderSurface, renderDocxForNativePrint } from "./docxToPdf";
import {
  FILE_ENGINE_CANCEL_EVENT,
  FILE_ENGINE_PROTOCOL_VERSION,
  FILE_ENGINE_RUN_EVENT,
  type FileEngineCancelRequest,
  type FilePageOcrInput,
  type FilePageOcrLease,
  type FileEngineCompletionRequest,
  type FileEngineProgressRequest,
  type FileEngineReadyRequest,
  type FileEngineRunRequest,
} from "./engineContracts";
import { installFileEngineRuntimePolyfills } from "./runtimePolyfills";
import "./fileEngine.css";

const ENGINE_VERSION = "1.3.0";
const controllers = new Map<string, AbortController>();

export function FileEngineApp() {
  useEffect(() => {
    let disposed = false;
    let unlisteners: Array<() => void> = [];
    void Promise.all([
      listen<FileEngineRunRequest>(FILE_ENGINE_RUN_EVENT, ({ payload }) => {
        if (!disposed) void runJob(payload);
      }),
      listen<FileEngineCancelRequest>(FILE_ENGINE_CANCEL_EVENT, ({ payload }) => {
        if (payload.protocolVersion === FILE_ENGINE_PROTOCOL_VERSION) {
          controllers.get(payload.token)?.abort();
        }
      }),
    ]).then(async (registeredUnlisteners) => {
      if (disposed) {
        registeredUnlisteners.forEach((unlisten) => unlisten());
        return;
      }
      unlisteners = registeredUnlisteners;
      await invoke<void>("file_engine_ready", {
        request: {
          protocolVersion: FILE_ENGINE_PROTOCOL_VERSION,
          engineVersion: ENGINE_VERSION,
          pluginId: "zero.file",
        } satisfies FileEngineReadyRequest,
      });
    });
    return () => {
      disposed = true;
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      unlisteners.forEach((unlisten) => unlisten());
      unlisteners = [];
    };
  }, []);

  return <main id="zero-file-engine-document" aria-hidden="true" />;
}

async function runJob(request: FileEngineRunRequest) {
  if (
    request.protocolVersion !== FILE_ENGINE_PROTOCOL_VERSION ||
    request.pluginId !== "zero.file" ||
    request.engineVersion !== ENGINE_VERSION ||
    request.deadlineMs <= Date.now()
  ) {
    return;
  }
  const controller = new AbortController();
  controllers.set(request.token, controller);
  let input: Uint8Array | null = null;
  let output: Uint8Array | null = null;
  const qualityIssues: FileConversionQualityIssue[] = [];
  const embeddedFamilies = new Set<string>();
  const inspectFonts = async (fontFamilies: string[]): Promise<FileConversionQualityIssue[]> => {
    const inspection = await invoke<FileFontInspection>("file_engine_inspect_fonts", { request: { protocolVersion: request.protocolVersion, token: request.token, engineVersion: request.engineVersion, jobId: request.jobId, fontFamilies: fontFamilies.slice(0,100) } });
    for (const family of inspection.embeddedFamilies) embeddedFamilies.add(family.toLowerCase());
    const issues: FileConversionQualityIssue[] = [];
    if (inspection.missingFamilies.length) issues.push(qualityIssue("fontMissing", { fontFamilies: inspection.missingFamilies }));
    if (inspection.incomplete || fontFamilies.length>100) issues.push(qualityIssue("fontInspectionIncomplete"));
    qualityIssues.push(...issues);
    return issues;
  };
  try {
    await reportProgress(request, "parsing", 0);
    input = await readInput(request);
    await reportProgress(request, "parsing", 1);
    if (request.direction === "pdfToDocx") {
      installFileEngineRuntimePolyfills();
      const { convertPdfToDocx } = await import("./pdfToDocx");
      const result = await convertPdfToDocx(input, controller.signal, async (progress) => {
        await reportProgress(request, progress.stage, progress.percent);
      }, { deadlineMs: request.deadlineMs, inspectFonts, recognizePage: request.ocrAvailable ? async (page, pageNumber, region) => {
        if (!region) throw new Error("unsupportedInput");
        const lease = await invoke<FilePageOcrLease>("prepare_file_page_ocr", { input: { token: request.token, jobId: request.jobId, engineVersion: request.engineVersion, pageNumber, width: page.width, height: page.height, region } satisfies FilePageOcrInput });
        try { return await invoke<import("../../../core/ocr/contracts").OcrPageResult>("upload_file_page_ocr", page.bytes, { headers: { "x-zero-file-ocr-lease": lease.leaseToken } }); }
        catch (error) { throw new Error(error === "providerUnavailable" || error === "languageUnavailable" || error === "unsupportedPlatform" ? "ocrRequired" : error === "timeout" ? "timeout" : error === "cancelled" ? "cancelled" : error === "resourceLimit" || error === "invalidInput" ? "unsupportedInput" : "providerFailed"); }
      } : undefined });
      output = result.bytes;
      await invoke<void>("file_engine_write_output", output, tokenHeaders(request));
      await reportCompletion(request, "completed", result.qualityProfile, result.warningKeys, result.pageCount, aggregateQualityIssues(result.qualityIssues ?? qualityIssues));
    } else {
      await reportProgress(request, "rendering", 20);
      await inspectFonts([]);
      qualityIssues.push(qualityIssue("layoutReflowed"));
      const measurement = await renderDocxForNativePrint(input, request, controller.signal, request.printPlatform, request.deadlineMs, (loadedFamilies) => {
        const loaded=new Set(loadedFamilies.map(family=>family.toLowerCase()));
        if ([...embeddedFamilies].some(family=>!loaded.has(family))) qualityIssues.push(qualityIssue("fontInspectionIncomplete"));
        for (const issue of qualityIssues) if (issue.code === "fontMissing") issue.fontFamilies=issue.fontFamilies?.filter(family=>!loaded.has(family.toLowerCase()));
        for (let index=qualityIssues.length-1;index>=0;index-=1) if (qualityIssues[index].code === "fontMissing" && qualityIssues[index].fontFamilies?.length===0) qualityIssues.splice(index,1);
      });
      await reportProgress(request, "printing", 80);
      await invoke<void>("file_engine_print_rendered", { request: { ...measurement, qualityIssues: aggregateQualityIssues(qualityIssues) } });
      await reportCompletion(
        request,
        "completed",
        "webRenderedPdf",
        ["file.quality.webRenderedPdfWarning"],
        measurement.measuredPageCount,
        aggregateQualityIssues(qualityIssues),
      );
    }
  } catch (error) {
    const cancelled = controller.signal.aborted ||
      (error instanceof Error && (error.name === "FileEngineCancelledError" || error.message === "cancelled")) ||
      (error instanceof DOMException && error.name === "AbortError");
    const errorMessage = error instanceof Error ? error.message : typeof error === "string" ? error : "providerFailed";
    controller.abort();
    const knownCode = ["invalidInput", "passwordRequired", "ocrRequired", "unsupportedInput", "timeout"].includes(errorMessage)
      ? errorMessage as "invalidInput" | "passwordRequired" | "ocrRequired" | "unsupportedInput" | "timeout" : "providerFailed";
    await invoke<void>("file_engine_complete", {
      request: {
        protocolVersion: FILE_ENGINE_PROTOCOL_VERSION,
        token: request.token,
        engineVersion: request.engineVersion,
        jobId: request.jobId,
        status: cancelled ? "cancelled" : "failed",
        warningKeys: [],
        qualityIssues: aggregateQualityIssues([...qualityIssues, ...(error instanceof QualityReportError ? error.qualityIssues : [])]),
        errorCode: cancelled ? "cancelled" : knownCode,
        diagnostic: cancelled ? "cancelled" : knownCode,
      } satisfies FileEngineCompletionRequest,
    }).catch(() => undefined);
  } finally {
    clearDocxRenderSurface();
    clearBytes(output);
    clearBytes(input);
    controllers.delete(request.token);
  }
}

function clearBytes(bytes: Uint8Array | null) {
  if (!bytes || bytes.byteLength === 0) return;
  try {
    bytes.fill(0);
  } catch {
    // PDF.js may transfer and detach its input buffer before terminal cleanup.
  }
}

async function readInput(request: FileEngineRunRequest) {
  const value = await invoke<ArrayBuffer>("file_engine_read_input", new Uint8Array(), tokenHeaders(request));
  const bytes = new Uint8Array(value);
  if (bytes.byteLength === 0 || bytes.byteLength > request.maxInputBytes) {
    throw new Error("The staged input size is outside the approved limit.");
  }
  return bytes;
}

function tokenHeaders(request: FileEngineRunRequest) {
  return {
    headers: {
      "x-zero-file-token": request.token,
      "x-zero-file-job": request.jobId,
      "x-zero-file-engine": request.engineVersion,
    },
  };
}

async function reportProgress(
  request: FileEngineRunRequest,
  stage: FileEngineProgressRequest["stage"],
  percent?: number,
) {
  await invoke<void>("file_engine_progress", {
    request: {
      protocolVersion: FILE_ENGINE_PROTOCOL_VERSION,
      token: request.token,
      engineVersion: request.engineVersion,
      jobId: request.jobId,
      stage,
      percent,
    } satisfies FileEngineProgressRequest,
  });
}

async function reportCompletion(
  request: FileEngineRunRequest,
  status: "completed",
  qualityProfile: FileConversionQualityProfile,
  warningKeys: string[],
  pageCount: number,
  qualityIssues: FileConversionQualityIssue[] = [],
) {
  await invoke<void>("file_engine_complete", {
    request: {
      protocolVersion: FILE_ENGINE_PROTOCOL_VERSION,
      token: request.token,
      engineVersion: request.engineVersion,
      jobId: request.jobId,
      status,
      qualityProfile,
      warningKeys,
      qualityIssues,
      pageCount,
    } satisfies FileEngineCompletionRequest,
  });
}
