import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { normalizeOcrError, type OcrCapability, type OcrError, type OcrPageResult } from "../../core/ocr/contracts";

interface SnapOcrSnapshot {
  jobId: string; revision: number; status: "recognizing" | "completed" | "failed" | "cancelled";
  result: OcrPageResult | null; error: OcrError | null; expiresAtMs: number;
}
export function useSnapOcr(surface: "tray" | "main") {
  const [capability, setCapability] = useState<OcrCapability | null>(null);
  const [snapshot, setSnapshot] = useState<SnapOcrSnapshot | null>(null);
  const [text, setText] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [actionError, setActionError] = useState<OcrError | null>(null);
  const requestRevision = useRef(0);
  const copyRevision = useRef(0);
  const refresh = useCallback(async () => {
    const revision = ++requestRevision.current;
    const next = await invoke<SnapOcrSnapshot | null>("get_snap_ocr");
    if (revision === requestRevision.current) setSnapshot(next);
  }, []);
  useEffect(() => {
    let disposed = false;
    void invoke<OcrCapability>("get_ocr_capability").then(value => { if (!disposed) setCapability(value); }).catch(() => undefined);
    if (surface !== "main") return () => { disposed = true; };
    const subscription = listen("zero://snap-ocr-changed", () => { if (!disposed) void refresh().catch(() => undefined); });
    void subscription.then(() => { if (!disposed) void refresh().catch(() => undefined); }).catch(() => undefined);
    return () => { disposed = true; requestRevision.current++; copyRevision.current++; void subscription.then(unlisten => unlisten()).catch(() => undefined); };
  }, [refresh, surface]);
  useEffect(() => {
    setText(snapshot?.result?.lines.map(line => line.text).join("\n") ?? "");
    copyRevision.current++;
    setCopyState("idle");
    setActionError(null);
    if (!snapshot) return;
    const timer = setTimeout(() => { requestRevision.current++; copyRevision.current++; setSnapshot(null); setText(""); }, Math.max(0, snapshot.expiresAtMs - Date.now()));
    return () => clearTimeout(timer);
  }, [snapshot?.jobId, snapshot?.revision]);
  const cancel = useCallback(async () => {
    const revision = ++requestRevision.current;
    setActionError(null);
    try { await invoke("cancel_snap_ocr"); if (revision === requestRevision.current) await refresh(); }
    catch (reason) { if (revision === requestRevision.current) setActionError(normalizeOcrError(reason)); }
  }, [refresh]);
  const clear = useCallback(async () => {
    const revision = ++requestRevision.current;
    copyRevision.current++;
    setActionError(null);
    try { await invoke("clear_snap_ocr"); if (revision === requestRevision.current) { setSnapshot(null); setText(""); } }
    catch (reason) { if (revision === requestRevision.current) setActionError(normalizeOcrError(reason)); }
  }, []);
  const copy = useCallback(async () => {
    const revision = ++copyRevision.current;
    try { await invoke("copy_snap_ocr", { text }); if (revision === copyRevision.current) setCopyState("copied"); } catch { if (revision === copyRevision.current) setCopyState("failed"); }
  }, [text]);
  const editText = useCallback((value: string) => { copyRevision.current++; setText(value); setCopyState("idle"); }, []);
  return { capability, snapshot, text, setText: editText, copyState, actionError, cancel, clear, copy };
}
