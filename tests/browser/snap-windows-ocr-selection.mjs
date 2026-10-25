import assert from "node:assert/strict";
const { chromium } = await import(process.env.SNAP_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, locale: "en-US" });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  const open = async () => {
    await page.goto(`${process.env.SNAP_TEST_ORIGIN || "http://127.0.0.1:1420"}/tests/fixtures/snap/annotation-editor.html?ocr-only`);
    await page.waitForFunction(() => window.snapInvocations?.some(call => call.cmd === "reveal_screenshot_capture"));
  };
  const select = async () => {
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(700, 450, { steps: 8 });
    await page.mouse.up();
    await page.locator(".capture-toolbar-stack[data-ready=true]").waitFor();
  };
  const calls = cmd => page.evaluate(cmd => window.snapInvocations.filter(call => call.cmd === cmd), cmd);
  await open();
  await page.keyboard.press("Enter");
  assert.equal((await calls("start_snap_ocr")).length, 0, "Enter without a selection cannot recognize");
  await select();
  assert.equal(await page.locator("[data-capture-tool]").count(), 0, "annotation and pin tools are withheld");
  assert.equal(await page.locator(".capture-geometry-controls,.capture-property-shell,.capture-toolbar-position-controls").count(), 0);
  assert.equal(await page.locator(".capture-toolbar-live button").count(), 2, "only recognize and cancel remain");
  assert.equal((await calls("start_snap_ocr")).length, 0, "selection does not automatically recognize");
  if (process.env.SNAP_SCREENSHOT_PATH) await page.screenshot({ path: process.env.SNAP_SCREENSHOT_PATH });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.snapInvocations.some(call => call.cmd === "start_snap_ocr"));
  const recognition = await calls("start_snap_ocr");
  assert.deepEqual(recognition[0].args.input, {
    sessionId: "synthetic", selection: { x: 100, y: 100, width: 600, height: 350 }, languages: [],
  });
  assert.equal((await calls("prepare_screenshot_commit")).length, 0, "OCR never submits image clipboard/save/pin actions");
  await open();
  await select();
  await page.getByRole("button", { name: "Screenshot OCR", exact: true }).click();
  assert.equal((await calls("start_snap_ocr")).length, 1, "button explicitly recognizes the selected region");
  await open();
  await page.keyboard.press("Escape");
  assert.equal((await calls("cancel_screenshot_session")).length, 1, "Escape releases the session before selection");
  assert.equal((await calls("start_snap_ocr")).length, 0);
  assert.deepEqual(errors, []);
  console.log("PASS: OCR selection withholds editor actions; button/Enter confirm; Escape cancels; no automatic recognition or image commit");
} finally {
  await browser.close();
}
