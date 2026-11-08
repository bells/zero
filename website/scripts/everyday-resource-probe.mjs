import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { launch } from "chrome-launcher";
import { processTreeRss } from "../experiments/image-codecs/process-memory.mjs";
const origin = process.env.WEBSITE_ORIGIN ?? "http://127.0.0.1:4321";
const chrome = await launch({
  chromeFlags: ["--headless", "--disable-extensions", "--js-flags=--expose-gc"],
  logLevel: "silent",
});
const browser = await chromium.connectOverCDP(
  `http://127.0.0.1:${chrome.port}`,
);
const context = await browser.newContext();
const page = await context.newPage();
const report = {
  capturedAt: new Date().toISOString(),
  browser: browser.version(),
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  measurements: {},
  resources: {},
};
function rss() {
  const sample = processTreeRss(
    execFileSync("ps", ["-axo", "pid=,ppid=,rss="], { encoding: "utf8" }),
    chrome.pid,
  );
  if (!sample.rootAlive)
    throw Error("Browser disappeared during memory sampling");
  return sample.rssBytes;
}
const ready = async (slug) => {
  await page.goto(`${origin}/en/tools/${slug}/`);
  await page.locator("[data-web-tools][data-ready=true]").waitFor();
};
async function measure(name, action) {
  const responses = [];
  const listener = (response) => responses.push(response);
  page.on("response", listener);
  const start = Date.now(),
    before = rss();
  let peak = before;
  const timer = setInterval(() => {
    peak = Math.max(peak, rss());
  }, 100);
  try {
    await action();
  } finally {
    clearInterval(timer);
    page.off("response", listener);
  }
  report.measurements[name] = {
    milliseconds: Date.now() - start,
    rssBefore: before,
    rssPeak: peak,
    rssAfter: rss(),
  };
  const unique = new Map();
  for (const response of responses)
    if (
      response.request().resourceType() === "script" &&
      new URL(response.url()).origin === origin &&
      ["http:", "https:"].includes(new URL(response.url()).protocol)
    ) {
      if (!unique.has(response.url())) {
        let body;
        try { body = await response.body(); }
        catch {
          const asset = await fetch(response.url());
          if (!asset.ok) throw new Error('Could not measure local Worker resource');
          body = new Uint8Array(await asset.arrayBuffer());
        }
        unique.set(response.url(), {
          path: new URL(response.url()).pathname,
          bytes: body.length,
          gzipBytes: gzipSync(body).length,
        });
      }
    }
  report.resources[name] = [...unique.values()];
}
try {
  await ready("qrcode");
  await page.locator("[data-everyday-example]").click();
  await measure("qrGeneration", async () => {
    await page.locator("[data-everyday-run]").click();
    await page.locator("[data-qr-png]:enabled").waitFor();
  });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-qr-png]").click();
  const download = await downloadPromise;
  const png = await sharp(await download.path())
    .resize(3400, 3400, { kernel: "nearest" })
    .png()
    .toBuffer();
  await page.locator('[data-option="qr-mode"]').selectOption("decode");
  await page
    .locator('[data-option="file"]')
    .setInputFiles({
      name: "synthetic-11.56mp.png",
      mimeType: "image/png",
      buffer: png,
    });
  await measure("qr11_56MPDecode", async () => {
    await page.locator("[data-everyday-run]").click();
    await page.locator("[data-everyday-download]:enabled").waitFor();
  });
  await page.locator("[data-clear]").click();
  report.measurements.qrAfterClearRss = rss();
  await ready("hash");
  await page.locator('[data-option="hash-mode"]').selectOption("file");
  await page.locator('[data-option="file"]').evaluate((input) => {
    const chunk = new Uint8Array(1048576);
    chunk.fill(97);
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(
        Array.from({ length: 256 }, () => chunk),
        "synthetic-256m.bin",
      ),
    );
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const hash = createHash("sha256"),
    chunk = Buffer.alloc(1048576, 97);
  for (let index = 0; index < 256; index++) hash.update(chunk);
  const expected = hash.digest("hex");
  await measure("hash256MiB", async () => {
    await page.locator("[data-everyday-run]").click();
    await page
      .locator("[data-everyday-download]:enabled")
      .waitFor({ timeout: 65000 });
  });
  if (
    (await page.locator("[data-output]").inputValue()).split("\n")[1] !==
    expected
  )
    throw Error("256MiB digest mismatch");
  await page.locator("[data-everyday-run]").click();
  const cancelled = Date.now();
  await page.locator("[data-cancel]").click();
  await page.locator("[data-everyday-run]:enabled").waitFor();
  report.measurements.hashCancelMs = Date.now() - cancelled;
  if (await page.locator("[data-everyday-download]").isEnabled())
    throw Error("cancel retained digest");
  await page.locator("[data-clear]").click();
  report.measurements.hashAfterClearRss = rss();
  await ready("regex");
  await page.locator('[data-option="pattern"]').fill("(a+)+$");
  await page.locator("[data-source]").fill("a".repeat(30000) + "!");
  await measure("regexPathologicalDeadline", async () => {
    await page.locator("[data-everyday-run]").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-status]")
          ?.textContent?.includes("deadline"),
      null,
      { timeout: 10000 },
    );
  });
  await ready("cron");
  await page.locator('[data-option="cron-mode"]').selectOption("spring");
  await page.locator('[data-option="expression"]').fill("0 0 0 29 FEB MON");
  await page.locator('[data-option="timezone"]').fill("UTC");
  await page.locator('[data-option="baseline"]').fill("2026-01-01T00:00:00Z");
  await measure("sparseCron50Years", async () => {
    await page.locator("[data-everyday-run]").click();
    await page.locator("[data-everyday-download]:enabled").waitFor();
  });
  report.measurements.cronResult = await page
    .locator("[data-output]")
    .inputValue();
  report.notes = [
    "Chrome process-tree RSS is sampled at 100ms and includes browser/renderers/files. It is not physical footprint or iPhone evidence. File construction itself allocates source storage before the hash baseline.",
    "Hash app reads remain capped at 1MiB per slice. Cancellation terminates the Worker. Clear disposes source references and URLs; OS reclamation is asynchronous.",
    "Initial resources are independently budgeted by verify:performance. These resource lists count only on-demand same-origin script bodies.",
  ];
  await mkdir("output", { recursive: true });
  await writeFile(
    "output/everyday-resources.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  chrome.kill();
}
