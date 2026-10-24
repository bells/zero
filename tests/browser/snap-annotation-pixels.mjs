import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.SNAP_PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SNAP_CHROME_PATH
    ? { executablePath: process.env.SNAP_CHROME_PATH }
    : {}),
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(
    `${process.env.SNAP_TEST_ORIGIN || "http://127.0.0.1:1420"}/tests/fixtures/snap/annotation-pixels.html`,
  );
  await page.waitForFunction(() => window.snapPixelResults);
  const results = await page.evaluate(() => window.snapPixelResults);
  assert.deepEqual(errors, []);
  assert.equal(results.length, 7);
  assert.deepEqual(
    results.filter((result) => !result.pass),
    [],
  );
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} finally {
  await browser.close();
}
