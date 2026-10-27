import assert from "node:assert/strict";

const { chromium } = await import(process.env.SNAP_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SNAP_CHROME_PATH ? { executablePath: process.env.SNAP_CHROME_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${process.env.SNAP_TEST_ORIGIN || "http://localhost:1420"}/tests/fixtures/snap/annotation-editor.html?strict`);
  // No pointer input: the real CaptureApp must decode, commit and request reveal.
  await page.waitForFunction(() => window.snapInvocations?.some(({ cmd, args }) =>
    cmd === "record_screenshot_startup" && args.input.stage === "readyAck"));
  const counts = await page.evaluate(() => ({
    init: window.snapInvocations.filter(({ cmd }) => cmd === "init_screenshot_session").length,
    reads: window.snapInvocations.filter(({ cmd }) => cmd === "read_screenshot_media").length,
    decoded: window.snapInvocations.filter(({ cmd, args }) => cmd === "record_screenshot_startup" && args.input.stage === "imageDecode").length,
    reveals: window.snapInvocations.filter(({ cmd }) => cmd === "reveal_screenshot_capture").length,
    imageReady: [...document.images].some((image) => image.complete && image.naturalWidth === 1000),
  }));
  assert.equal(counts.init, 2, "exercise StrictMode effect replay");
  assert.equal(counts.reads, 1, "disposed initialization must not read the screenshot again");
  assert.equal(counts.decoded, 1, "only the live initialization should decode pixels");
  assert.equal(counts.reveals, 1);
  assert.equal(counts.imageReady, true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.snapInvocations.some(({ cmd }) => cmd === "cancel_screenshot_session"));
  assert.deepEqual(errors, []);
  console.log("PASS: StrictMode loads one image, reveals without pointer input, and Escape cancels");
  await page.goto(`${process.env.SNAP_TEST_ORIGIN || "http://localhost:1420"}/tests/fixtures/snap/annotation-editor.html?main`);
  await page.waitForFunction(() => window.snapInvocations?.some(({ cmd, args }) =>
    cmd === "record_screenshot_startup" && args.input.stage === "readyAck"));
  assert.equal(await page.evaluate(() => window.snapLoadingCommits), 0,
    "hidden capture must not commit a Suspense fallback and wait for its retry throttle");
  assert.deepEqual(errors, []);
  console.log("PASS: production capture route loads before mounting without a loading fallback");
  await page.route("**/plugins/screenshot/capture/CaptureApp.tsx*", (route) => route.abort());
  await page.goto(`${process.env.SNAP_TEST_ORIGIN || "http://localhost:1420"}/tests/fixtures/snap/annotation-editor.html?main`);
  await page.getByRole("alert").waitFor();
  assert.equal(await page.evaluate(() => window.snapInvocations.some(({ cmd, args }) =>
    cmd === "emit_frontend_diagnostic" && args.input.event.code === "ui.render_failed")), true);
  assert.equal(await page.evaluate(() => window.snapInvocations.some(({ cmd }) => cmd === "reveal_screenshot_capture")), false);
  console.log("PASS: failed capture import reaches the diagnostic boundary without revealing an empty view");
} finally {
  await browser.close();
}
