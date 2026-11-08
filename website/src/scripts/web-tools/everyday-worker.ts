/// <reference lib="webworker" />
import { fail, type JobResponse } from "../../lib/web-tools/contracts";
import {
  validateEverydayJob,
  type EverydayJob,
  type EverydayValue,
} from "../../lib/web-tools/everyday-contracts";
async function execute(job: EverydayJob) {
  const validation = validateEverydayJob(job);
  if (!validation.ok) return validation;
  switch (job.tool) {
    case "text-cleanup":
      return (await import("../../lib/web-tools/text-cleanup")).cleanupText(
        job.input,
        job.options,
      );
    case "date-calculator":
      return (
        await import("../../lib/web-tools/date-calculator")
      ).calculateDate(job.options);
    case "password":
      return (await import("../../lib/web-tools/password")).generatePasswords(
        job.options,
      );
    case "regex":
      return (await import("../../lib/web-tools/regex")).executeRegex(
        job.options,
      );
    case "hash":
      return (await import("../../lib/web-tools/hash")).hashInput(job.options);
    case "sql":
      return (await import("../../lib/web-tools/sql")).executeSql(job.options);
    case "cron":
      return (await import("../../lib/web-tools/cron")).executeCron(
        job.options,
      );
    case "qrcode":
      return (await import("./qrcode-process")).processQr(job.options);
  }
}
self.onmessage = async (
  event: MessageEvent<EverydayJob & { requestId: number }>,
) => {
  const { requestId } = event.data;
  let response: JobResponse<EverydayValue>;
  try {
    response = { requestId, result: await execute(event.data) };
  } catch {
    response = { requestId, result: fail("worker") };
  }
  self.postMessage(response);
};
