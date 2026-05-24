import type { AnnotationObject } from "./captureTypes";

export interface CommitScreenshotPayload {
  sessionId: string;
  action: "copy" | "save";
  pngBase64: string;
  savePath?: string;
}

export function serializeAnnotationObject(annotation: AnnotationObject): AnnotationObject {
  return structuredClone(annotation);
}

export function buildCommitScreenshotPayload(input: CommitScreenshotPayload): {
  input: {
    session_id: string;
    action: "copy" | "save";
    png_base64: string;
    save_path?: string;
  };
} {
  return {
    input: {
      session_id: input.sessionId,
      action: input.action,
      png_base64: input.pngBase64,
      ...(input.savePath ? { save_path: input.savePath } : {}),
    },
  };
}

export function buildPinScreenshotPayload(sessionId: string, pngBase64: string): {
  input: {
    session_id: string;
    png_base64: string;
  };
} {
  return {
    input: {
      session_id: sessionId,
      png_base64: pngBase64,
    },
  };
}
