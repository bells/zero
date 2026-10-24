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
const page = await browser.newPage({
  viewport: { width: 1000, height: 700 },
  locale: "en-US",
});
const results = [],
  measurements = [],
  errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (e) => {
  if (["warning", "error"].includes(e.type())) errors.push(e.text());
});
const settle = () => page.waitForTimeout(60);
const box = (selector) => page.locator(selector).boundingBox();
const bar = () => box(".capture-toolbar-stack");
const panel = () => box(".capture-property-shell");
const handle = () => page.locator(".capture-toolbar-drag");
const mode = () =>
  page.locator(".capture-toolbar-stack").getAttribute("data-mode");
const tool = (name) => page.getByRole("button", { name, exact: true }).click();
const resetToolbar = () => handle().dblclick();
const number = (name) => page.getByRole("spinbutton", { name, exact: true });
const drag = async (x, y, toX, toY) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 6 });
  await page.mouse.up();
  await settle();
};
const open = async (crop = [200, 160, 800, 350]) => {
  await page.goto(
    `${process.env.SNAP_TEST_ORIGIN || "http://127.0.0.1:1420"}/tests/fixtures/snap/annotation-editor.html`,
  );
  await page.waitForFunction(() =>
    window.snapInvocations?.some((x) => x.cmd === "reveal_screenshot_capture"),
  );
  await drag(...crop);
  await page.locator('.capture-toolbar-stack[data-ready="true"]').waitFor();
};
const moveToolbar = async (left, top, finish = true) => {
  const origin = await bar(),
    grip = await handle().boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + grip.width / 2 + left - origin.x,
    grip.y + grip.height / 2 + top - origin.y,
    { steps: 6 },
  );
  if (finish) await page.mouse.up();
  await settle();
};
const samePosition = (a, b) => {
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
};
const coupled = (oldBar, newBar, oldPanel, newPanel) => {
  assert.equal(newPanel.x - oldPanel.x, newBar.x - oldBar.x);
  assert.equal(newPanel.y - oldPanel.y, newBar.y - oldBar.y);
};
try {
  await open();
  assert.match(await page.title(), /Snap synthetic/);
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  const initial = await bar();
  assert.equal(initial.x + initial.width / 2, 500);
  for (const name of [
    "Rectangle",
    "Mosaic",
    "Text",
    "Pen",
    "Select screenshot area",
    "Rectangle",
  ]) {
    await tool(name);
    await settle();
    assert.deepEqual(await bar(), initial);
  }
  assert.equal(await page.locator(".capture-toolbar-live button").count(), 15);
  assert.ok(
    (
      await page
        .locator(".capture-toolbar-live button")
        .evaluateAll((nodes) => nodes.map((el) => el.getBoundingClientRect()))
    ).every((r) => r.width === 40 && r.height === 40),
  );
  assert.equal(await handle().innerText(), "");
  assert.equal((await handle().boundingBox()).width, 28);
  assert.equal(
    await page.locator(".capture-toolbar-restore-position").count(),
    0,
  );
  assert.equal(
    await page
      .locator(
        ".capture-property-shell .capture-toolbar-drag, .capture-property-drag, .capture-property-position-overlay",
      )
      .count(),
    0,
  );
  const hidden = page.locator(".capture-property-measurements");
  await hidden
    .locator("button")
    .first()
    .evaluate((el) => el.focus());
  assert.equal(
    await hidden.evaluate((el) => el.contains(document.activeElement)),
    false,
  );
  measurements.push({
    state: "below",
    toolbar: await bar(),
    panel: await panel(),
  });
  await page.screenshot({ path: "/tmp/snap-group-after-below.png" });
  results.push(
    "stable centered automatic layout, 15 original 40px actions, fixed icon-only toolbar grip; no independent property drag controls",
  );
  const attachedGeometry = await box(".capture-geometry-controls"),
    selectionFrame = await box(".capture-selection-frame");
  assert.ok(
    Math.abs(
      selectionFrame.y - attachedGeometry.y - attachedGeometry.height - 2,
    ) < 0.1,
  );
  await moveToolbar(80, attachedGeometry.y);
  assert.deepEqual(await box(".capture-geometry-controls"), attachedGeometry);
  const covered = await page.evaluate(
    ({ x, y }) =>
      Boolean(
        document.elementFromPoint(x, y)?.closest(".capture-toolbar-stack"),
      ),
    { x: attachedGeometry.x + 10, y: attachedGeometry.y + 10 },
  );
  assert.equal(
    covered,
    true,
    "toolbar may cover crop-attached geometry without moving it",
  );
  await resetToolbar();
  assert.equal(await mode(), "automatic");
  assert.deepEqual(await bar(), initial);
  await handle().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  assert.equal(await mode(), "automatic");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  assert.equal(await mode(), "automatic");
  assert.deepEqual(await box(".capture-geometry-controls"), attachedGeometry);
  await open([200, 10, 800, 500]);
  await tool("Rectangle");
  const insideGeometry = await box(".capture-geometry-controls"),
    topSelection = await box(".capture-selection-frame");
  assert.ok(Math.abs(insideGeometry.y - topSelection.y - 2) < 0.1);
  measurements.push({
    state: "crop-top-inside",
    geometry: insideGeometry,
    selection: topSelection,
  });
  await page.screenshot({ path: "/tmp/snap-geometry-inside.png" });
  await open([200, 0, 800, 4]);
  await tool("Rectangle");
  await settle();
  const tinyStrip = await box(".capture-geometry-controls"),
    tinyToolbar = await bar();
  assert.ok(
    tinyToolbar.y >= tinyStrip.y + tinyStrip.height + 7,
    "automatic toolbar clears inside strip for tiny top-edge crop",
  );
  await open();
  await tool("Rectangle");
  results.push(
    "icon-only grip double-click/Enter/Space reset; geometry stays 2px above or inside crop and remains stationary under dragged toolbar",
  );
  const beforePanel = await panel(),
    crop = await box(".capture-selection-frame"),
    saved = await page.evaluate(() =>
      localStorage.getItem("zero.snap.annotation-defaults.v1"),
    );
  await handle().click();
  assert.equal(await mode(), "automatic");
  await moveToolbar(80, 140);
  assert.equal(await mode(), "manual");
  samePosition(await bar(), { x: 80, y: 140 });
  coupled(initial, await bar(), beforePanel, await panel());
  assert.equal(await page.locator(".capture-property-caret").count(), 1);
  assert.deepEqual(await box(".capture-selection-frame"), crop);
  assert.equal(
    await page.getByRole("button", { name: "Undo", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("zero.snap.annotation-defaults.v1"),
    ),
    saved,
  );
  const stableBar = await bar(),
    stablePanel = await panel();
  const title = await page
    .locator(".capture-property-shell header strong")
    .boundingBox();
  await drag(
    title.x + title.width / 2,
    title.y + title.height / 2,
    title.x + title.width / 2 - 25,
    title.y + title.height / 2 - 25,
  );
  assert.deepEqual(await bar(), stableBar);
  assert.deepEqual(await panel(), stablePanel);
  await number("Stroke width · px").fill("9");
  await number("Stroke width · px").press("Enter");
  const slider = page.getByRole("slider", {
    name: "Opacity · % · slider",
    exact: true,
  });
  await slider.fill("70");
  await slider.press("Enter");
  await tool("Color #448aff");
  assert.deepEqual(await bar(), stableBar);
  samePosition(await panel(), stablePanel);
  await tool("Restore tool defaults · Rectangle");
  assert.deepEqual(await bar(), stableBar);
  samePosition(await panel(), stablePanel);
  await page.screenshot({ path: "/tmp/snap-group-after-manual.png" });
  results.push(
    "toolbar drag translates attached properties, keeps caret/crop/history/storage; property blank, slider, color and style reset never detach or move group",
  );
  await resetToolbar();
  assert.equal(await mode(), "automatic");
  samePosition(await bar(), initial);
  for (const cancel of ["escape", "pointercancel", "lostcapture"]) {
    const oldBar = await bar(),
      oldPanel = await panel();
    await moveToolbar(70, 160, false);
    assert.equal(await mode(), "manual");
    if (cancel === "escape") await page.keyboard.press("Escape");
    else if (cancel === "pointercancel")
      await handle().dispatchEvent("pointercancel", { pointerId: 1 });
    else await handle().evaluate((el) => el.releasePointerCapture(1));
    await page.mouse.up();
    await settle();
    assert.equal(await mode(), "automatic");
    assert.deepEqual(await bar(), oldBar);
    assert.deepEqual(await panel(), oldPanel);
  }
  await moveToolbar(80, 160);
  const manualBar = await bar(),
    manualPanel = await panel();
  await moveToolbar(100, 200, false);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await mode(), "manual");
  assert.deepEqual(await bar(), manualBar);
  assert.deepEqual(await panel(), manualPanel);
  await handle().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  samePosition(await bar(), { x: 81, y: 170 });
  coupled(manualBar, await bar(), manualPanel, await panel());
  await page.keyboard.press("Delete");
  await page.keyboard.press("Meta+z");
  assert.equal(
    await page.getByRole("button", { name: "Undo", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.snapInvocations.filter(
          (x) => x.cmd === "cancel_screenshot_session",
        ).length,
    ),
    0,
  );
  results.push(
    "pointer release commits; Escape/cancel/lost capture restore complete automatic/manual group; keyboard 1/10px movement isolates canvas hotkeys",
  );
  await open([50, 50, 950, 650]);
  await tool("Rectangle");
  await moveToolbar(8, 590);
  const retained = await bar();
  assert.equal(
    await page.locator(".capture-property-shell").getAttribute("data-side"),
    "above",
  );
  for (const name of [
    "Mosaic",
    "Text",
    "Select screenshot area",
    "Rectangle",
  ]) {
    await tool(name);
    await settle();
    assert.deepEqual(await bar(), retained);
  }
  await drag(150, 180, 300, 280);
  assert.deepEqual(await bar(), retained);
  const attached = await panel();
  await tool("Color #448aff");
  await tool("Restore tool defaults · Rectangle");
  assert.deepEqual(await bar(), retained);
  samePosition(await panel(), attached);
  await tool("Select screenshot area");
  await page.mouse.click(200, 220);
  await settle();
  assert.deepEqual(await bar(), retained);
  assert.equal(await page.locator(".capture-property-caret").count(), 1);
  await tool("Select screenshot area");
  await drag(600, 300, 620, 320);
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  await width.fill("800");
  await width.press("Enter");
  await tool("Rectangle");
  await settle();
  assert.deepEqual(await bar(), retained);
  results.push(
    "manual toolbar persists across tools, objects, hidden properties and crop move/resize, with properties always derived from toolbar",
  );
  await open();
  await tool("Rectangle");
  await moveToolbar(80, 140);
  await tool("Select screenshot area");
  const height = page.getByRole("textbox", { name: "Height", exact: true });
  await height.fill("500");
  await height.press("Enter");
  await tool("Rectangle");
  await settle();
  samePosition(await bar(), { x: 80, y: 140 });
  assert.equal(
    await page.locator(".capture-property-shell").getAttribute("data-side"),
    "below",
  );
  const stylesBefore = await page.evaluate(() =>
    localStorage.getItem("zero.snap.annotation-defaults.v1"),
  );
  await resetToolbar();
  assert.equal(await mode(), "automatic");
  assert.equal(
    await page.locator(".capture-property-shell").getAttribute("data-side"),
    "above",
  );
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("zero.snap.annotation-defaults.v1"),
    ),
    stylesBefore,
  );
  await open([200, 400, 800, 699]);
  await tool("Rectangle");
  await settle();
  assert.equal(
    await page.locator(".capture-toolbar-stack").getAttribute("data-placement"),
    "outside-top",
  );
  assert.ok((await panel()).y + (await panel()).height < (await bar()).y);
  const fixedStrip = await box(".capture-geometry-controls"),
    automaticAbove = await bar();
  assert.ok(
    automaticAbove.y + automaticAbove.height <= fixedStrip.y - 7,
    "automatic toolbar clears crop-attached strip above selection",
  );
  measurements.push({
    state: "above",
    toolbar: await bar(),
    panel: await panel(),
  });
  await page.screenshot({ path: "/tmp/snap-group-after-above.png" });
  const aboveBar = await bar(),
    abovePanel = await panel();
  await moveToolbar(60, 280);
  coupled(aboveBar, await bar(), abovePanel, await panel());
  await open([1, 1, 999, 699]);
  await tool("Rectangle");
  assert.equal(await mode(), "automatic");
  assert.equal(
    await page.locator(".capture-toolbar-stack").getAttribute("data-placement"),
    "inside-bottom",
  );
  measurements.push({
    state: "inside",
    toolbar: await bar(),
    panel: await panel(),
  });
  await page.screenshot({ path: "/tmp/snap-group-after-inside.png" });
  results.push(
    "manual side stays stable when crop changes; recovery recomputes current selection; above/inside panels follow and new capture resets automatic mode",
  );
  await moveToolbar(0, 0);
  assert.ok((await bar()).y >= (await panel()).height + 16);
  for (const [width, height] of [
    [360, 480],
    [360, 160],
    [720, 480],
  ]) {
    await page.setViewportSize({ width, height });
    await tool("Rectangle");
    await settle();
    await moveToolbar(-1000, 1000);
    const b = await bar(),
      p = await panel();
    assert.ok(
      b.x >= 8 &&
        b.y >= 8 &&
        b.x + b.width <= width - 7 &&
        b.y + b.height <= height - 7,
    );
    assert.ok(
      p.x >= 8 &&
        p.y >= 8 &&
        p.x + p.width <= width - 7 &&
        p.y + p.height <= height - 7,
      JSON.stringify({ width, height, p }),
    );
    for (const selector of [".capture-toolbar-drag"]) {
      const control = await box(selector);
      assert.ok(control.x >= b.x && control.x + control.width <= b.x + b.width);
    }
    const geometry = await page
      .locator(
        ".capture-geometry-controls input, .capture-geometry-controls output",
      )
      .evaluateAll((nodes) =>
        nodes.map((el) => ({
          left: el.getBoundingClientRect().left,
          right: el.getBoundingClientRect().right,
        })),
      );
    assert.ok(geometry.every((r) => r.left >= 8 && r.right <= width - 8));
    const copy = page.getByRole("button", {
      name: "Copy screenshot",
      exact: true,
    });
    await copy.focus();
    const action = await copy.boundingBox();
    assert.ok(action.x >= b.x && action.x + action.width <= b.x + b.width);
    const nav = page.locator(".capture-toolbar-live");
    await nav.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await settle();
    const anchorVisible = await page
      .locator('[data-capture-tool="rectangle"]')
      .evaluate((el) => {
        const button = el.getBoundingClientRect(),
          nav = el.closest(".capture-toolbar-live").getBoundingClientRect();
        const center = button.x + button.width / 2;
        return center >= nav.left && center <= nav.right;
      });
    assert.equal(
      await page.locator(".capture-property-caret").count(),
      anchorVisible ? 1 : 0,
    );
    await tool("Rectangle");
    await settle();
    measurements.push({
      state: `${width}x${height}`,
      toolbar: await bar(),
      panel: await panel(),
    });
    if (width === 360 && height === 480)
      await page.screenshot({ path: "/tmp/snap-group-after-narrow.png" });
  }
  results.push(
    "entire group stays bounded at edges and responsive sizes, property scrolling, fixed toolbar grip with double-click recovery and scrollable 15 actions remain reachable",
  );
  await page.setViewportSize({ width: 1000, height: 700 });
  await open([1, 1, 999, 699]);
  await tool("Rectangle");
  await tool("Restore tool defaults · Rectangle");
  await drag(150, 150, 300, 250);
  await moveToolbar(20, 120);
  for (const name of ["Copy screenshot", "Save screenshot"]) await tool(name);
  await tool("Pin");
  await drag(100, 300, 400, 500);
  await page.waitForFunction(() => window.snapUploads.length === 3);
  await tool("Select screenshot area");
  await tool("Screenshot OCR");
  const outputs = await page.evaluate(async () => {
    const decoded = await Promise.all(
      window.snapUploadBytes.map((bytes) =>
        createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        ),
      ),
    );
    return decoded.map((bitmap, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return {
        width: canvas.width,
        height: canvas.height,
        toolbarBackground: [...ctx.getImageData(24, 124, 1, 1).data],
        panelBackground: [...ctx.getImageData(199, 39, 1, 1).data],
        annotation: [...ctx.getImageData(199, 149, 1, 1).data],
      };
    });
  });
  assert.equal(outputs.length, 3);
  for (const output of outputs.slice(0, 2)) {
    assert.deepEqual(output.toolbarBackground.slice(0, 3), [231, 233, 236]);
    assert.deepEqual(output.panelBackground.slice(0, 3), [231, 233, 236]);
    assert.deepEqual(output.annotation.slice(0, 3), [255, 82, 82]);
  }
  assert.ok(
    (await page.evaluate(() => window.snapInvocations)).some(
      (x) => x.cmd === "start_snap_ocr",
    ),
  );
  results.push(
    "Copy/Save/Pin PNG uploads exclude moved toolbar and properties, factory red remains exact, OCR retains original-session request",
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "zero.snap.annotation-defaults.v1",
      JSON.stringify({
        version: 1,
        tools: {
          rectangle: { color: "#55f280" },
          text: { color: "#112233", fontSize: 36 },
        },
      }),
    ),
  );
  await open();
  await tool("Rectangle");
  assert.equal(
    await page
      .getByRole("button", { name: "Color #55f280", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await moveToolbar(80, 140);
  const savedBar = await bar();
  await tool("Restore tool defaults · Rectangle");
  assert.deepEqual(await bar(), savedBar);
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("zero.snap.annotation-defaults.v1")),
  );
  assert.equal(persisted.tools.rectangle.color, "#ff5252");
  assert.equal(persisted.tools.text.color, "#112233");
  await open();
  await tool("Rectangle");
  assert.equal(await mode(), "automatic");
  assert.equal(
    await page
      .getByRole("button", { name: "Color #ff5252", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  results.push(
    "valid saved green is preserved; resetting one tool persists red without moving toolbar or changing other defaults",
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "zero.preferences.v1",
      JSON.stringify({ language: "zh-CN" }),
    ),
  );
  await open();
  await tool("矩形");
  assert.equal(await handle().innerText(), "");
  assert.equal(
    await page
      .getByRole("button", {
        name: "拖动工具栏（双击或 Enter 复原；方向键 1px，Shift+方向键 10px）",
        exact: true,
      })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "恢复工具栏自动位置", exact: true })
      .count(),
    0,
  );
  const oldBar = await bar(),
    oldPanel = await panel();
  await moveToolbar(80, 140);
  coupled(oldBar, await bar(), oldPanel, await panel());
  await page.screenshot({ path: "/tmp/snap-group-after-zh.png" });
  const groupBar = await bar(),
    groupPanel = await panel();
  const left = Math.min(groupBar.x, groupPanel.x),
    top = Math.min(groupBar.y, groupPanel.y);
  await page.screenshot({
    path: "/tmp/snap-toolbar-group-detail-zh.png",
    clip: {
      x: left,
      y: top,
      width:
        Math.max(groupBar.x + groupBar.width, groupPanel.x + groupPanel.width) -
        left,
      height:
        Math.max(
          groupBar.y + groupBar.height,
          groupPanel.y + groupPanel.height,
        ) - top,
    },
  });
  measurements.push({
    state: "zh-CN-manual",
    toolbar: await bar(),
    panel: await panel(),
  });
  results.push(
    "Chinese grip advertises double-click recovery accessibly; properties contain only editing controls and follow toolbar",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      { passed: results.length, results, measurements, outputs, errors },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/snap-group-failure.png" });
  console.error(
    JSON.stringify(
      {
        completed: results,
        error: String(error),
        body: await page.locator("body").innerText(),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
