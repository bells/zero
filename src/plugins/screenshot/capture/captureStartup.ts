import { invoke } from "@tauri-apps/api/core";

export type CaptureStartupStage = "mount" | "mediaRead" | "imageDecode" | "displayDecode" | "readyAck";
interface CaptureStartupMeasurement {
  sessionId: string;
  stage: CaptureStartupStage;
  durationUs: number;
}
export function recordCaptureStartup(sessionId: string, stage: CaptureStartupStage, started: number): void {
  const input: CaptureStartupMeasurement = {
    sessionId, stage, durationUs: Math.max(0, Math.round((performance.now() - started) * 1000)),
  };
  void invoke("record_screenshot_startup", { input }).catch(() => undefined);
}
