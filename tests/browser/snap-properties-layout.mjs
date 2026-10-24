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
const errors = [],
  results = [],
  measurements = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (e) => {
  if (["error", "warning"].includes(e.type())) errors.push(e.text());
});
const settle = () => page.waitForTimeout(60);
const tool = (name) => page.getByRole("button", { name, exact: true }).click();
const panel = () => page.locator(".capture-property-shell");
const open = async () => {
  await page.goto(
    `${process.env.SNAP_TEST_ORIGIN || "http://127.0.0.1:1420"}/tests/fixtures/snap/annotation-editor.html`,
  );
  await page.waitForFunction(() =>
    window.snapInvocations?.some((x) => x.cmd === "reveal_screenshot_capture"),
  );
  await page.mouse.move(50, 50);
  await page.mouse.down();
  await page.mouse.move(950, 650);
  await page.mouse.up();
  await page.locator(".capture-toolbar-stack[data-ready=true]").waitFor();
};
const checkRows = async (name) => {
  await tool(name);
  await settle();
  const rows = panel().locator(".capture-property-row");
  assert.equal(await rows.count(), 2, `${name} has two rows`);
  const boxes = await rows.evaluateAll((nodes) =>
    nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  assert.ok(
    boxes.every((r) => r.height >= 28 && r.height <= 32),
    JSON.stringify({ name, boxes }),
  );
  assert.ok(boxes[1].y > boxes[0].y + boxes[0].height);
  const shell = await panel().boundingBox();
  assert.ok(shell.height <= 88, JSON.stringify({ name, shell }));
  const colors = await panel().locator(".capture-color-swatch").count();
  assert.equal(colors, name === "Mosaic" ? 0 : 5);
  assert.equal(
    await panel().locator("input[type=color]").count(),
    name === "Mosaic" ? 0 : 1,
  );
  measurements.push({
    name,
    viewport: page.viewportSize(),
    shell,
    rows: boxes,
  });
  return shell;
};
try {
  await open();
  await tool("Rectangle");
  await settle();
  if (process.env.SNAP_BEFORE_PATH)
    await panel().screenshot({ path: process.env.SNAP_BEFORE_PATH });
  const initialBar = await page.locator(".capture-toolbar-stack").boundingBox();
  for (const name of [
    "Rectangle",
    "Ellipse",
    "Arrow",
    "Pen",
    "Text",
    "Mosaic",
  ]) {
    await checkRows(name);
    assert.deepEqual(
      await page.locator(".capture-toolbar-stack").boundingBox(),
      initialBar,
    );
  }
  await tool("Rectangle");
  assert.equal(
    await page
      .getByRole("button", { name: "Color #ff5252", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  results.push(
    "all six tools use two consistent rows with five presets and one native picker only for colored tools; toolbar stays stable",
  );
  const custom = panel().getByLabel("Custom color", { exact: true });
  assert.equal(await custom.getAttribute("type"), "color");
  assert.equal(await custom.evaluate((el) => typeof el.showPicker), "function");
  await custom.fill("#123456");
  await custom.press("Tab");
  await settle();
  assert.equal(await custom.inputValue(), "#123456");
  assert.equal(
    await panel().locator(".capture-custom-color").getAttribute("data-active"),
    "true",
  );
  assert.equal(
    await panel().locator(".capture-color-swatch[aria-pressed=true]").count(),
    0,
  );
  await tool("Restore tool defaults · Rectangle");
  assert.equal(
    await page
      .getByRole("button", { name: "Color #ff5252", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.mouse.move(150, 180);
  await page.mouse.down();
  await page.mouse.move(300, 280);
  assert.equal(await custom.isDisabled(), true);
  assert.equal(
    await custom.evaluate((el) => getComputedStyle(el).opacity),
    "0",
    "disabled native color input stays transparent above the palette icon",
  );
  await page.mouse.up();
  await settle();
  assert.equal(
    await page
      .getByRole("region", {
        name: "Rectangle · Selected annotation",
        exact: true,
      })
      .count(),
    1,
  );
  assert.equal(await panel().locator(".capture-property-row").count(), 2);
  await custom.fill("#123456");
  await custom.press("Tab");
  await tool("Undo");
  await tool("Select screenshot area");
  await page.mouse.click(225, 180);
  assert.equal(await custom.inputValue(), "#ff5252");
  await tool("Redo");
  await page.mouse.click(225, 180);
  assert.equal(await custom.inputValue(), "#123456");
  results.push(
    "disabled native input remains transparent; custom selected-object color commits once and supports undo/redo",
  );
  const invalid = page.getByRole("spinbutton", {
    name: "Stroke width · px",
    exact: true,
  });
  const height = await panel().boundingBox();
  await invalid.fill("1.5");
  assert.equal(await invalid.getAttribute("aria-invalid"), "true");
  assert.equal((await panel().boundingBox()).height, height.height);
  await invalid.press("Escape");
  results.push(
    "native custom color updates defaults, reset keeps red, selected-object context and invalid numeric feedback preserve two-row height",
  );
  await tool("Rectangle");
  await panel().screenshot({ path: "/tmp/snap-two-rows-desktop.png" });
  await page.setViewportSize({ width: 360, height: 480 });
  for (const name of [
    "Rectangle",
    "Ellipse",
    "Arrow",
    "Pen",
    "Text",
    "Mosaic",
  ]) {
    const box = await checkRows(name);
    assert.ok(box.x >= 8 && box.x + box.width <= 352);
  }
  await tool("Rectangle");
  await settle();
  const scroll = panel().locator(".capture-property-content");
  assert.equal(
    await scroll.evaluate((el) => el.scrollWidth > el.clientWidth),
    true,
  );
  const radius = page.getByRole("spinbutton", {
    name: "Object radius · px",
    exact: true,
  });
  await radius.focus();
  await settle();
  const target = await radius.boundingBox(),
    clip = await scroll.boundingBox();
  assert.ok(
    target.x >= clip.x && target.x + target.width <= clip.x + clip.width,
  );
  await radius.press("Tab");
  await panel().screenshot({ path: "/tmp/snap-two-rows-narrow.png" });
  results.push(
    "360px layout keeps two rows, bounded horizontal scrolling and focused controls remain reachable for every tool",
  );
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.evaluate(() =>
    localStorage.setItem(
      "zero.snap.annotation-defaults.v1",
      JSON.stringify({
        version: 1,
        tools: { rectangle: { color: "#b388ff" } },
      }),
    ),
  );
  await open();
  await tool("Rectangle");
  const savedCustom = panel().getByLabel("Custom color", { exact: true });
  assert.equal(await savedCustom.inputValue(), "#b388ff");
  assert.equal(
    await panel().locator(".capture-custom-color").getAttribute("data-active"),
    "true",
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "zero.preferences.v1",
      JSON.stringify({ language: "zh-CN" }),
    ),
  );
  await open();
  await tool("矩形");
  await settle();
  assert.equal(await panel().locator(".capture-property-row").count(), 2);
  assert.equal(
    await panel().getByLabel("自定义颜色", { exact: true }).inputValue(),
    "#b388ff",
  );
  await tool("恢复工具默认值 · 矩形");
  await settle();
  await panel().screenshot({ path: "/tmp/snap-two-rows-zh.png" });
  results.push(
    "saved non-palette colors survive unchanged; compact Chinese context and native custom picker remain accessible",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      { passed: results.length, results, measurements, errors },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/snap-two-rows-failure.png" });
  console.error(
    JSON.stringify(
      {
        completed: results,
        error: String(e),
        body: await page.locator("body").innerText(),
      },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}
