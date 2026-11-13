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
const origin = process.env.SNAP_TEST_ORIGIN || "http://127.0.0.1:1420";
const results = [];
let page;
try {
  page = await browser.newPage({
    viewport: { width: 1000, height: 700 },
    locale: "en-US",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const drag = async (x, y, toX, toY) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(toX, toY, { steps: 8 });
    await page.mouse.up();
  };
  const tool = (name) =>
    page.getByRole("button", { name, exact: true }).click();
  const frame = () => page.locator(".capture-object-frame").boundingBox();
  const open = async (query = "") => {
    await page.goto(
      `${origin}/tests/fixtures/snap/annotation-editor.html${query}`,
    );
    await page.waitForFunction(() =>
      window.snapInvocations?.some(
        (x) => x.cmd === "reveal_screenshot_capture",
      ),
    );
    await drag(50, 50, 950, 650);
    await page.locator(".capture-toolbar-stack[data-ready=true]").waitFor();
  };
  const selected = (name) =>
    page.getByRole("region", {
      name: `${name} · Selected annotation`,
      exact: true,
    });
  const input = async (name, value) => {
    const field = page.getByRole("spinbutton", { name, exact: true });
    await field.fill(String(value));
    await field.press("Enter");
  };
  const near = (actual, want) =>
    assert.ok(Math.abs(actual - want) < 1, `${actual} should be near ${want}`);
  await open();
  assert.match(await page.title(), /Snap synthetic/);
  await tool("Rectangle");
  await drag(150, 150, 350, 250);
  assert.equal(
    await page.locator(".capture-object-handle").count(),
    8,
    "new annotation exposes handles without Select",
  );
  const crop = await page.locator(".capture-selection-frame").boundingBox();
  await drag(200, 150, 220, 180);
  let box = await frame();
  near(box.x, 170);
  near(box.y, 180);
  near(box.width, 200);
  assert.deepEqual(
    await page.locator(".capture-selection-frame").boundingBox(),
    crop,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Rectangle", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.keyboard.down("Shift");
  await drag(370, 280, 430, 280);
  await page.keyboard.up("Shift");
  box = await frame();
  near(box.width / box.height, 2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(
    await page.locator(".capture-object-frame").count(),
    0,
    "Undo clears selection",
  );
  await page.mouse.click(170, 220);
  box = await frame();
  near(box.width, 200);
  results.push(
    "new rectangle directly moves/resizes; Shift ratio and one-step Undo preserve crop",
  );

  await tool("Ellipse");
  await drag(500, 150, 650, 250);
  await page.mouse.click(170, 220);
  assert.equal(await selected("Rectangle").count(), 1);
  assert.equal(
    await page
      .getByRole("button", { name: "Ellipse", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await input("Opacity · %", 40);
  await drag(500, 350, 650, 450);
  assert.equal(await selected("Ellipse").count(), 1);
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Opacity · %", exact: true })
      .inputValue(),
    "100",
  );
  await tool("Arrow");
  await drag(220, 210, 320, 240);
  assert.equal(
    await selected("Arrow").count(),
    1,
    "outline interior starts a new drawing",
  );
  results.push(
    "cross-tool properties leave active tool/defaults independent; outline interior allows drawing",
  );

  await open();
  await tool("Rectangle");
  await drag(150, 150, 400, 300);
  await page
    .getByRole("combobox", { name: "Shape", exact: true })
    .selectOption("solid");
  await tool("Pen");
  await page.keyboard.down("Alt");
  await page.mouse.move(220, 200);
  await page.mouse.down();
  await page.mouse.move(250, 220, { steps: 5 });
  await page.keyboard.up("Alt");
  await page.mouse.move(280, 230, { steps: 5 });
  await page.mouse.up();
  assert.equal(await selected("Pen").count(), 1);
  await tool("Arrow");
  await page.mouse.move(200, 180);
  await page.mouse.down();
  await page.keyboard.down("Alt");
  await page.mouse.move(220, 190, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  assert.equal(
    await selected("Rectangle").count(),
    1,
    "pressing Option late must not switch object movement to drawing",
  );
  await page.keyboard.down("Alt");
  box = await frame();
  await drag(
    box.x + box.width,
    box.y + box.height,
    box.x + box.width + 20,
    box.y + box.height + 20,
  );
  await page.keyboard.up("Alt");
  assert.equal(
    await selected("Rectangle").count(),
    1,
    "Option does not pass through a handle",
  );
  results.push(
    "Option bypass is fixed at gesture start and preserves handle operations",
  );

  await open();
  await tool("Text");
  await page.mouse.click(250, 180);
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await text.fill("中文 AB\nSecond line");
  await text.press("Meta+Enter");
  assert.equal(await page.locator(".capture-object-handle").count(), 4);
  box = await frame();
  const anchor = { x: box.x, y: box.y };
  await drag(
    box.x + box.width,
    box.y + box.height,
    box.x + box.width * 1.5,
    box.y + box.height * 1.5,
  );
  assert.ok(
    Number(
      await page
        .getByRole("spinbutton", { name: "Font size · px", exact: true })
        .inputValue(),
    ) > 24,
  );
  box = await frame();
  near(box.x, anchor.x);
  near(box.y, anchor.y);
  await tool("Rectangle");
  await page.mouse.dblclick(box.x + 15, box.y + 15);
  assert.equal(await text.count(), 1);
  assert.equal(await text.inputValue(), "中文 AB\nSecond line");
  await text.dispatchEvent("compositionstart");
  await text.press("Enter");
  assert.equal(await text.count(), 1);
  await text.dispatchEvent("compositionend");
  await text.fill("Edited 中文\nSecond line");
  await text.press("Meta+Enter");
  assert.equal(
    await page
      .getByRole("button", { name: "Rectangle", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await selected("Text").count(), 1);
  results.push(
    "Text has proportional font handles and cross-tool double-click/IME-safe re-editing",
  );
  await page.screenshot({ path: "/tmp/snap-direct-text.png" });

  await open();
  await tool("Rectangle");
  await drag(50, 50, 250, 180);
  await tool("Select screenshot area");
  await page.mouse.click(50, 110);
  box = await frame();
  await drag(50, 50, 70, 70);
  const after = await frame();
  near(after.x, 70);
  near(after.y, 70);
  assert.deepEqual(
    await page.locator(".capture-selection-frame").boundingBox(),
    { x: 50, y: 50, width: 900, height: 600 },
  );
  await tool("Ellipse");
  await page.mouse.click(70, 100);
  const original = await frame();
  await page.mouse.move(70, 100);
  await page.mouse.down();
  await page.mouse.move(110, 140, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(
    await frame(),
    original,
    "Escape rolls back exactly one object gesture",
  );
  results.push(
    "coincident object/crop handle selects object; cross-tool Escape rolls back",
  );

  await open();
  await tool("Pen");
  await drag(200, 180, 400, 280);
  box = await frame();
  await drag(
    box.x + box.width,
    box.y + box.height / 2,
    box.x + box.width + 100,
    box.y + box.height / 2,
  );
  box = await frame();
  near(box.width / box.height, 2);
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Stroke width · px", exact: true })
      .inputValue(),
    "5",
  );
  await tool("Mosaic");
  await drag(500, 180, 650, 280);
  await drag(540, 220, 560, 240);
  box = await frame();
  near(box.x, 520);
  near(box.y, 200);
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Pixel block · px", exact: true })
      .inputValue(),
    "14",
  );
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Opacity · %", exact: true })
      .count(),
    0,
  );
  await tool("Arrow");
  await drag(200, 350, 400, 400);
  await drag(400, 400, 450, 450);
  box = await frame();
  near(box.width, 250);
  near(box.height, 100);
  await drag(325, 400, 335, 420);
  box = await frame();
  near(box.x, 210);
  near(box.y, 370);
  results.push(
    "Pen stays proportional with fixed stroke, Mosaic moves its region, Arrow body/endpoints remain editable",
  );

  await tool("Rectangle");
  await drag(700, 180, 850, 280);
  const beforeCancel = await frame();
  for (const cancel of ["pointercancel", "lostpointercapture"]) {
    await page.mouse.move(730, 180);
    await page.mouse.down();
    await page.mouse.move(750, 220, { steps: 5 });
    assert.equal(
      await page
        .getByRole("button", { name: "Copy screenshot", exact: true })
        .isEnabled(),
      false,
    );
    if (cancel === "pointercancel")
      await page
        .locator(".capture-overlay")
        .dispatchEvent("pointercancel", { pointerId: 1 });
    else
      await page
        .locator(".capture-overlay")
        .evaluate((canvas) => canvas.releasePointerCapture(1));
    await page.mouse.up();
    await page.waitForFunction(
      (expected) => {
        const f = document.querySelector(".capture-object-frame");
        return (
          f &&
          parseFloat(f.style.left) === expected.x &&
          parseFloat(f.style.top) === expected.y
        );
      },
      beforeCancel,
      { timeout: 2000 },
    );
    assert.deepEqual(
      await frame(),
      beforeCancel,
      cancel + " restores the original object",
    );
  }
  await page.mouse.move(730, 180);
  await page.mouse.down();
  await page.mouse.move(750, 220, { steps: 5 });
  await page
    .getByRole("button", { name: "Arrow", exact: true })
    .dispatchEvent("click");
  await page.mouse.up();
  await page.mouse.click(730, 180);
  assert.deepEqual(
    await frame(),
    beforeCancel,
    "tool switch cancels before late pointer release",
  );
  await tool("Text");
  await page.mouse.click(200, 480);
  await text.fill("PNG 中文\nAB");
  await text.press("Meta+Enter");
  box = await frame();
  await drag(
    box.x + box.width,
    box.y + box.height,
    box.x + box.width + 30,
    box.y + box.height + 30,
  );
  await page
    .getByRole("button", { name: "Copy screenshot", exact: true })
    .click();
  await page.waitForFunction(() => window.snapUploadBytes.length === 1);
  const png = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(window.snapUploadBytes[0])], {
        type: "image/png",
      }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const output = canvas
      .getContext("2d")
      .getImageData(0, 0, bitmap.width, bitmap.height).data;
    const expected = document
      .querySelector(".capture-overlay")
      .getContext("2d")
      .getImageData(50, 50, 900, 600).data;
    const equal =
      output.length === expected.length &&
      output.every((value, index) => value === expected[index]);
    bitmap.close();
    return {
      width: canvas.width,
      height: canvas.height,
      equal,
      actions: window.snapUploads.map(
        (x) => x.headers["x-zero-screenshot-action"],
      ),
    };
  });
  assert.deepEqual(png, {
    width: 900,
    height: 600,
    equal: true,
    actions: ["copy"],
  });
  const stored = await page.evaluate(() =>
    localStorage.getItem("zero.snap.annotation-defaults.v1"),
  );
  if (stored)
    assert.doesNotMatch(
      stored,
      /中文|points|selectedId|synthetic-media|annotations/,
    );
  results.push(
    "pointer cancellation/lost capture/tool switch roll back; exported PNG equals committed preview with no control chrome",
  );

  await open();
  await tool("Rectangle");
  await drag(150, 150, 350, 250);
  await tool("Select screenshot area");
  const cropWidth = page.getByRole("textbox", { name: "Width", exact: true });
  await cropWidth.fill("200"); await cropWidth.press("Enter");
  await tool("Rectangle"); await page.mouse.click(180, 150);
  await drag(350, 250, 400, 300);
  box = await frame(); near(box.width, 250); near(box.height, 150);
  assert.equal(await cropWidth.inputValue(), "200");
  results.push("object handles outside a smaller crop remain editable without starting drawing outside the crop");

  await open("?ocr-only");
  assert.equal(await page.locator(".capture-object-frame").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "Rectangle", exact: true }).count(),
    0,
  );
  await drag(950, 350, 900, 350);
  const ocrCrop = await page.locator(".capture-selection-frame").boundingBox();
  near(ocrCrop.x, 50); near(ocrCrop.width, 850); near(ocrCrop.height, 600);
  await page.screenshot({ path: "/tmp/snap-direct-ocr-only.png" });
  await open();
  await page.setViewportSize({ width: 360, height: 640 });
  await tool("Rectangle");
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  await page.screenshot({ path: "/tmp/snap-direct-narrow.png" });
  assert.deepEqual(errors, []);
  results.push("OCR-only stays separate; narrow layout renders without errors");
  console.log(
    JSON.stringify(
      { passed: results.length, results, pageErrors: errors },
      null,
      2,
    ),
  );
} catch (error) {
  if (page)
    await page
      .screenshot({ path: "/tmp/snap-direct-failure.png" })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
