import {useEffect, useState} from "react";
import type {DocumentInput, DocumentJob, ZeroBridge} from "@zero/sdk";

function activeJob(job: DocumentJob | null): boolean {
  return job?.status === "preparing" || job?.status === "running" || job?.status === "cancelling";
}

export function useConversion(bridge: ZeroBridge) {
  const [input, setInput] = useState<DocumentInput | null>(null);
  const [job, setJob] = useState<DocumentJob | null>(null);
  const [dialog, setDialog] = useState<"input" | "output" | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = activeJob(job);
  const jobId = active ? job?.id : undefined;

  useEffect(() => {
    if (!jobId) return;
    const requests = new AbortController();
    let timer: number | undefined;
    let failures = 0;
    const poll = async () => {
      const result = await bridge.request("documents.status", {id: jobId}, {signal: requests.signal});
      if (requests.signal.aborted) return;
      if (result.ok) {
        failures = 0;
        setJob(result.value);
        if (!activeJob(result.value)) {
          setCancelPending(false);
          return;
        }
      } else {
        failures += 1;
        setError(result.error.code);
      }
      timer = window.setTimeout(() => void poll(), failures > 0 ? 1200 : 280);
    };
    void poll();
    return () => {
      requests.abort();
      window.clearTimeout(timer);
    };
  }, [bridge, jobId]);

  async function chooseInput() {
    setDialog("input");
    setError(null);
    const result = await bridge.request("documents.chooseInput", {});
    if (!result.ok) setError(result.error.code);
    else if (result.value) {
      setInput(result.value);
      setJob(null);
    }
    setDialog(null);
  }

  async function start() {
    if (!input) return;
    setDialog("output");
    setError(null);
    const result = await bridge.request("documents.start", {id: input.id});
    if (!result.ok) setError(result.error.code);
    else if (result.value) setJob(result.value);
    setDialog(null);
  }

  async function cancel() {
    if (!job) return;
    setCancelPending(true);
    const result = await bridge.request("documents.cancel", {id: job.id});
    if (!result.ok) {
      setError(result.error.code);
      setCancelPending(false);
    }
  }

  async function reveal() {
    if (!job) return;
    setError(null);
    const result = await bridge.request("documents.reveal", {id: job.id});
    if (!result.ok) setError(result.error.code);
  }

  return {input, job, active, dialog, cancelPending, error, chooseInput, start, cancel, reveal};
}
