import { useCallback, useEffect, useRef, useState } from "react";
import type { AboutInfo, DiagnosticMode, DiagnosticsPreview, DiagnosticsStatus, SupportTarget } from "./contracts";
import type { TranslationKey } from "../preferences/i18n";
import { diagnosticsService as service } from "../../services/diagnosticsService";
import { diagnosticsErrorKey } from "../../services/diagnosticsServiceCore";

export function useDiagnostics() {
  const [info, setInfo] = useState<AboutInfo | null>(null);
  const [status, setStatus] = useState<DiagnosticsStatus | null>(null);
  const [preview, setPreview] = useState<DiagnosticsPreview | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ key: TranslationKey; error: boolean } | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const sequence = useRef(0);
  const run = useCallback(async (action: string, operation: () => Promise<void>, success?: TranslationKey) => {
    if (busy.current) return;
    busy.current = true; setPending(action); setFeedback(null);
    try { await operation(); if (mounted.current && success) setFeedback({ key: success, error: false }); }
    catch (error: unknown) { if (mounted.current) setFeedback({ key: diagnosticsErrorKey(error), error: true }); }
    finally { busy.current = false; if (mounted.current) setPending(null); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const turn = ++sequence.current;
    Promise.all([service.about(), service.status()]).then(([about, state]) => {
      if (mounted.current && sequence.current === turn) { setInfo(about); setStatus(state); }
    }).catch((error: unknown) => { if (mounted.current && sequence.current === turn) setFeedback({ key: diagnosticsErrorKey(error), error: true }); });
    return () => { mounted.current = false; ++sequence.current; };
  }, []);
  useEffect(() => {
    if (status?.mode !== "verbose") return;
    let live = true;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || busy.current) return;
      service.status().then(state => { if (live) setStatus(state); }).catch(() => undefined);
    }, 5000);
    return () => { live = false; window.clearInterval(timer); };
  }, [status?.mode]);
  const refresh = () => run("preview", async () => {
    const next = await service.preview();
    if (mounted.current) { setPreview(next); setExpanded(true); }
    const state = await service.status();
    if (mounted.current) setStatus(state);
  });
  return {
    info, status, preview, expanded, setExpanded, pending, feedback,
    refresh,
    copy: () => preview ? run("copy", () => service.copy(preview.previewId), "diagnostics.copied") : refresh(),
    openLink: (target: SupportTarget) => run(target, () => service.openLink(target)),
    openDirectory: () => run("directory", service.openDirectory),
    clear: () => run("clear", async () => { await service.clear();
      if (mounted.current) setPreview(null);
      const state = await service.status();
      if (mounted.current) setStatus(state); }, "diagnostics.cleared"),
    setMode: (mode: DiagnosticMode) => run("mode", async () => { const next = await service.mode(mode); if (mounted.current) setStatus(next); }),
  };
}
