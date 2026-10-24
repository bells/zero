// Optional real-browser checks: SNAP_PLAYWRIGHT_MODULE may point to an existing Playwright installation.
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
const results = [];
let currentPage;
try {
  const page = (currentPage = await browser.newPage({
    viewport: { width: 1000, height: 700 },
    locale: "en-US",
  }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const drag = async (x, y, toX, toY) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(toX, toY, { steps: 8 });
    await page.mouse.up();
  };
  const tool = async (name) =>
    page.getByRole("button", { name, exact: true }).click();
  const number = (name) => page.getByRole("spinbutton", { name, exact: true });
  const input = async (name, value) => {
    const field = number(name);
    await field.fill(String(value));
    await field.press("Enter");
  };
  const open = async () => {
    await page.goto(
      `${process.env.SNAP_TEST_ORIGIN || "http://127.0.0.1:1420"}/tests/fixtures/snap/annotation-editor.html`,
    );
    await page.waitForFunction(() =>
      window.snapInvocations?.some(
        (x) => x.cmd === "reveal_screenshot_capture",
      ),
    );
    await drag(50, 50, 950, 650);
    await page.locator(".capture-toolbar-stack[data-ready=true]").waitFor();
  };
  const frame = () => page.locator(".capture-object-frame").boundingBox();
  await open();
  const initialCrop = await page
    .locator(".capture-selection-frame")
    .boundingBox();
  await drag(600, 500, 620, 510);
  assert.deepEqual(
    await page.locator(".capture-selection-frame").boundingBox(),
    { ...initialCrop, x: initialCrop.x + 20, y: initialCrop.y + 10 },
  );
  await drag(600, 500, 580, 490);
  await page.mouse.click(600, 500);
  assert.deepEqual(
    await page.locator(".capture-selection-frame").boundingBox(),
    initialCrop,
  );
  results.push(
    "blank crop interior keeps translation and click geometry semantics",
  );
  await tool("Rectangle");
  assert.equal(
    await page
      .getByRole("region", {
        name: "Rectangle · Drawing defaults",
        exact: true,
      })
      .count(),
    1,
  );
  const anchorPanel = async (name) => {
    await tool(name);
    await page.waitForTimeout(40);
    const button = await page.getByRole("button", {name, exact:true}).boundingBox();
    const panel = await page.locator(".capture-property-shell .capture-annotation-properties").boundingBox();
    const caret = await page.locator(".capture-property-caret").boundingBox();
    assert.ok(panel.y + panel.height < button.y, "panel is above inside-bottom toolbar");
    assert.ok(Math.abs(caret.x + caret.width/2 - (button.x+button.width/2)) < 2, "caret points to tool");
    return panel.x;
  };
  const rectanglePanelX = await anchorPanel("Rectangle");
  const ellipsePanelX = await anchorPanel("Ellipse");
  assert.ok(ellipsePanelX > rectanglePanelX, "panel follows corresponding button");
  await tool("Rectangle");
  results.push("properties anchored above Rectangle/Ellipse with pointing caret");
  await input("Stroke width · px", 12);
  await input("Object radius · px", 40);
  await drag(150, 150, 300, 250);
  const selectedRectangle = page.getByRole("region", { name: "Rectangle · Selected annotation", exact:true });
  assert.equal(await selectedRectangle.count(), 1, "new rectangle stays editable without Select");
  const pixel = (x,y) => page.locator(".capture-overlay").evaluate((canvas,{x,y}) => [...canvas.getContext("2d").getImageData(x,y,1,1).data],{x,y});
  await page.waitForTimeout(40);
  const outlinePixel = await pixel(225,200);
  await page.getByRole("combobox",{name:"Shape",exact:true}).selectOption("solid");
  await page.waitForTimeout(40);
  assert.notDeepEqual(await pixel(225,200), outlinePixel, "new object's fill previews immediately");
  await input("Opacity · %", 40);
  if (process.env.SNAP_SCREENSHOT_PATH) await page.screenshot({path:process.env.SNAP_SCREENSHOT_PATH});
  await tool("Undo");
  await tool("Select screenshot area");
  await page.mouse.click(225,200);
  assert.equal(await number("Opacity · %").inputValue(), "100");
  await tool("Redo");
  await page.mouse.click(225,200);
  assert.equal(await number("Opacity · %").inputValue(), "40");
  await tool("Undo");
  await tool("Undo");
  await tool("Rectangle");
  assert.equal(await number("Opacity · %").inputValue(), "100");
  await drag(400, 150, 550, 250);
  assert.equal(await selectedRectangle.count(),1);
  assert.equal(await number("Opacity · %").inputValue(),"100", "object changes leave next defaults intact");
  results.push("new drawing live properties, pixel preview, undo/redo and next-object defaults");
  assert.equal(
    await page
      .getByRole("button", { name: "Rectangle", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await number("Object radius · px").inputValue(), "40");
  results.push("rectangle defaults and continuous drawing");
  const cropBefore = await page
    .locator(".capture-selection-frame")
    .boundingBox();
  await tool("Select screenshot area");
  await page.mouse.click(200, 200);
  assert.equal(
    await page
      .getByRole("region", {
        name: "Rectangle · Selected annotation",
        exact: true,
      })
      .count(),
    1,
  );
  const original = await frame();
  await drag(200, 200, 230, 220);
  let current = await frame();
  assert.equal(current.x, original.x + 30);
  assert.equal(current.y, original.y + 20);
  assert.deepEqual(
    await page.locator(".capture-selection-frame").boundingBox(),
    cropBefore,
  );
  await tool("Undo");
  assert.deepEqual(
    await page.locator(".capture-selection-frame").boundingBox(),
    cropBefore,
  );
  await page.mouse.click(200, 200);
  assert.equal((await frame()).x, original.x);
  await drag(300, 250, 330, 270);
  current = await frame();
  assert.equal(current.width, original.width + 30);
  assert.equal(current.height, original.height + 20);
  await tool("Undo");
  await page.mouse.click(200, 200);
  assert.equal((await frame()).width, original.width);
  results.push("object move/resize commits once and leaves crop unchanged");
  await number("Opacity · %").fill("60");
  await number("Opacity · %").fill("1.5");
  await number("Opacity · %").press("Tab");
  await tool("Rectangle");
  await tool("Select screenshot area");
  await page.mouse.click(200, 200);
  assert.equal(await number("Opacity · %").inputValue(), "100");
  assert.equal(
    await page.getByRole("button", { name: "Redo", exact: true }).isEnabled(),
    true,
  );
  results.push("invalid numeric blur rolls back preview and preserves redo");
  await input("Opacity · %", 40);
  await tool("Undo");
  await page.mouse.click(200, 200);
  assert.equal(await number("Opacity · %").inputValue(), "100");
  await tool("Redo");
  await page.mouse.click(200, 200);
  assert.equal(await number("Opacity · %").inputValue(), "40");
  await tool("Rectangle");
  assert.equal(await number("Opacity · %").inputValue(), "100");
  results.push("selected properties undo/redo and defaults isolation");
  await tool("Select screenshot area");
  await page.mouse.click(200, 200);
  const slider = page.getByRole("slider", {
    name: "Opacity · % · slider",
    exact: true,
  });
  await slider.focus();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await slider.press("Enter");
  await tool("Undo");
  await page.mouse.click(200, 200);
  assert.equal(await number("Opacity · %").inputValue(), "40");
  const beforeCancelledPointer = await frame();
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(240, 230, { steps: 5 });
  await page
    .locator(".capture-overlay")
    .dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  assert.deepEqual(await frame(), beforeCancelledPointer);
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(230, 230, { steps: 5 });
  await page
    .locator(".capture-overlay")
    .evaluate((canvas) => canvas.releasePointerCapture(1));
  await page.mouse.up();
  await page.waitForFunction(
    (expected) =>
      parseFloat(document.querySelector(".capture-object-frame").style.left) ===
      expected.x,
    beforeCancelledPointer,
  );
  assert.deepEqual(await frame(), beforeCancelledPointer);
  results.push(
    "slider commits one history entry; pointercancel and lost capture restore original geometry",
  );

  await tool("Select screenshot area");
  await page.mouse.click(200, 200);
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(240, 240, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal((await frame()).x, original.x);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".capture-object-frame").count(), 0);
  assert.equal(
    await page.evaluate(() =>
      window.snapInvocations.some((x) => x.cmd === "cancel_screenshot_session"),
    ),
    false,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page.evaluate(() =>
      window.snapInvocations.some((x) => x.cmd === "cancel_screenshot_session"),
    ),
    true,
  );
  results.push(
    "Escape rolls back, deselects, then cancels one layer at a time",
  );
  await open();
  await tool("Text");
  await page.mouse.click(150, 180);
  const textarea = page.getByRole("textbox", { name: "Text", exact: true });
  await textarea.fill("Hello 中文\nsecond line");
  assert.equal(
    await page
      .getByRole("button", { name: "Copy screenshot", exact: true })
      .isDisabled(),
    true,
  );
  const textTopBeforeSize = (await textarea.boundingBox()).y;
  await number("Font size · px").fill("32");
  await number("Font size · px").press("Enter");
  assert.equal(await textarea.count(), 1);
  assert.equal(
    (await textarea.boundingBox()).y,
    textTopBeforeSize - 8,
    "text editor follows fixed source baseline when size changes",
  );
  await page.getByRole("checkbox", { name: "Bold", exact: true }).check();
  await textarea.focus();
  await textarea.press("Meta+Enter");
  assert.equal(await textarea.count(), 0);
  await tool("Select screenshot area");
  await page.mouse.dblclick(170, 200);
  assert.equal(await textarea.inputValue(), "Hello 中文\nsecond line");
  await textarea.fill("edited 中英文\nline");
  await textarea.press("Escape");
  assert.equal(await textarea.count(), 0);
  await page.mouse.dblclick(170, 200);
  assert.equal(await textarea.inputValue(), "Hello 中文\nsecond line");
  await textarea.fill("");
  await textarea.press("Meta+Enter");
  assert.equal(await page.locator(".capture-object-frame").count(), 0);
  await tool("Undo");
  await page.mouse.dblclick(170, 200);
  assert.equal(await textarea.inputValue(), "Hello 中文\nsecond line");
  await textarea.dispatchEvent("compositionstart");
  await textarea.press("Meta+Enter");
  assert.equal(await textarea.count(), 1);
  await textarea.dispatchEvent("compositionend");
  await textarea.press("Escape");
  results.push(
    "multiline/bold create, re-edit, rollback, empty deletion, undo, composition arbitration",
  );
  await tool("Mosaic");
  assert.equal(await number("Pixel block · px").count(), 1);
  assert.equal(await number("Opacity · %").count(), 0);
  assert.equal(
    await page.locator(".capture-property-shell").getByLabel("Custom color", { exact: true }).count(),
    0,
  );
  await tool("Pen");
  await input("Stroke width · px", 99);
  assert.equal(await number("Stroke width · px").inputValue(), "32");
  await number("Stroke width · px").fill("1.5");
  assert.equal(
    await number("Stroke width · px").getAttribute("aria-invalid"),
    "true",
  );
  await number("Stroke width · px").press("Escape");
  assert.equal(await number("Stroke width · px").inputValue(), "32");
  await tool("Pin");
  assert.equal(await page.locator(".capture-property-shell .capture-annotation-properties").count(), 0);
  results.push("tool-specific controls and numeric invalid/clamp/Escape");
  await tool("Arrow");
  await page
    .getByRole("combobox", { name: "Arrowheads", exact: true })
    .selectOption("double");
  await drag(150, 180, 350, 180);
  await tool("Select screenshot area");
  await page.mouse.click(250, 180);
  await page.locator(".capture-object-frame").waitFor({ state: "attached" });
  assert.equal(await page.locator("[data-object-handle]").count(), 2);
  await drag(350, 180, 400, 220);
  assert.equal((await frame()).width, 250);
  await tool("Text");
  assert.equal(await number("Font size · px").inputValue(), "32");
  const stored = await page.evaluate(() =>
    localStorage.getItem("zero.snap.annotation-defaults.v1"),
  );
  assert.ok(stored);
  assert.doesNotMatch(stored, /Hello|中文|synthetic-media|sessionId/);
  await open();
  await tool("Text");
  assert.equal(await number("Font size · px").inputValue(), "32");
  await page
    .getByRole("button", { name: "Restore tool defaults · Text", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Font size · px"]').value ===
      "24",
  );
  results.push(
    "arrow endpoints, allowlisted storage, reload and per-tool reset",
  );
  await tool("Rectangle");
  await page.evaluate(() => {
    window.snapOriginalStorageWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw Error("synthetic quota");
    };
  });
  await input("Stroke width · px", 11);
  await page.locator(".capture-storage-notice").waitFor();
  await drag(650, 150, 750, 250);
  await tool("Select screenshot area");
  await page.mouse.click(700, 200);
  assert.equal(await number("Stroke width · px").inputValue(), "11");
  await page
    .getByRole("button", { name: "Dismiss notice", exact: true })
    .click();
  await page.evaluate(() => {
    Storage.prototype.setItem = window.snapOriginalStorageWrite;
  });
  results.push(
    "storage write failure is localized and nonblocking for current drawing",
  );
  await tool("Copy screenshot");
  await page.waitForFunction(()=>window.snapUploads.length===1);
  await tool("Save screenshot");
  await page.waitForFunction(()=>window.snapUploads.length===2);
  await tool("Pin"); await drag(100,150,200,250);
  await page.waitForFunction(()=>window.snapUploads.length===3);
  const uploads=await page.evaluate(()=>window.snapUploads);
  assert.deepEqual(uploads.map(upload=>upload.headers['x-zero-screenshot-action']),['copy','save','pin']);
  assert.equal(new Set(uploads.map(upload=>upload.headers['x-zero-screenshot-lease'])).size,3);
  for(const upload of uploads){assert.ok(upload.byteLength>8);assert.deepEqual(upload.signature,[137,80,78,71,13,10,26,10]);}
  results.push('Copy/Save/Pin share committed PNG composition and raw upload lease headers');
  await open();
  await tool("Rectangle");
  await input("Stroke width · px", 4);
  await input("Object radius · px", 0);
  await drag(150, 180, 300, 280);
  await input("Stroke width · px", 16);
  await input("Object radius · px", 25);
  await input("Opacity · %", 40);
  await tool("Color #ff5252");
  await page.getByRole("combobox", {name:"Shape",exact:true}).selectOption("solid");
  await drag(400, 180, 550, 280);
  assert.equal(await number("Stroke width · px").inputValue(), "4");
  assert.equal(await number("Object radius · px").inputValue(), "0");
  assert.equal(await number("Opacity · %").inputValue(), "100");
  assert.equal(await page.getByRole("combobox", {name:"Shape",exact:true}).inputValue(),"outline");
  await tool("Select screenshot area");
  await page.mouse.click(225,220);
  assert.equal(await number("Stroke width · px").inputValue(), "16");
  assert.equal(await number("Object radius · px").inputValue(), "25");
  assert.equal(await number("Opacity · %").inputValue(), "40");
  assert.equal(await page.getByRole("button", {name:"Color #ff5252",exact:true}).getAttribute("aria-pressed"),"true");
  assert.equal(await page.getByRole("combobox", {name:"Shape",exact:true}).inputValue(),"solid");
  await tool("Ellipse");
  await drag(600,180,750,280);
  assert.equal(await page.getByRole("region",{name:"Ellipse · Selected annotation",exact:true}).count(),1);
  await input("Stroke width · px",20);
  await page.getByRole("button",{name:"Ellipse",exact:true}).focus();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("region",{name:"Ellipse · Drawing defaults",exact:true}).count(),1);
  await tool("Select screenshot area");
  await page.mouse.click(675,220);
  assert.equal(await number("Stroke width · px").inputValue(),"20");
  await tool("Ellipse");
  await drag(600,300,750,400);
  await tool("Delete annotation");
  assert.equal(await page.getByRole("region",{name:"Ellipse · Drawing defaults",exact:true}).count(),1);
  await tool("Undo");
  assert.equal(await page.getByRole("region",{name:"Ellipse · Drawing defaults",exact:true}).count(),1);
  await tool("Redo");
  assert.equal(await page.getByRole("region",{name:"Ellipse · Drawing defaults",exact:true}).count(),1);
  results.push("live shape fields stay on current object; next drawing, Escape, deletion and history clear targets safely");
  for (const [width, height] of [
    [360, 300],
    [720, 480],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await tool("Rectangle");
    await page.waitForTimeout(80);
    const stack = await page.locator(".capture-toolbar-stack").boundingBox(),
      geometry = await page.locator(".capture-geometry-controls").boundingBox();
    assert.ok(
      stack.x >= 7 &&
        stack.y >= 7 &&
        stack.x + stack.width <= width - 7 &&
        stack.y + stack.height <= height - 7,
      JSON.stringify({ width, height, stack }),
    );
    const crop = await page.locator(".capture-selection-frame").boundingBox();
    const preferredTop = crop.y - geometry.height - 2 >= 0 ? crop.y - geometry.height - 2 : crop.y + 2;
    assert.ok(Math.abs(geometry.y - Math.max(0, Math.min(preferredTop,height-geometry.height))) < 0.1);
  }
  await page.setViewportSize({width:360,height:480});
  await tool("Ellipse");
  const nav = page.locator(".capture-toolbar-live");
  await nav.evaluate(el => {el.scrollLeft = 60;});
  await page.waitForTimeout(60);
  const scrolledButton = await page.getByRole("button",{name:"Ellipse",exact:true}).boundingBox();
  const scrolledCaret = await page.locator(".capture-property-caret").boundingBox();
  assert.ok(Math.abs(scrolledCaret.x+scrolledCaret.width/2-scrolledButton.x-scrolledButton.width/2)<2);
  await nav.evaluate(el => {el.scrollLeft = el.scrollWidth;});
  await page.waitForTimeout(60);
  assert.equal(await page.locator(".capture-property-caret").count(),0,"hidden tool has no misleading caret");
  results.push("caret tracks horizontal toolbar scrolling and hides for offscreen tools");
  assert.deepEqual(errors, []);
  results.push(
    "measured panel stays within narrow/resized viewport and geometry remains attached to crop",
  );
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} catch (error) {
  if (currentPage) {
    await currentPage.screenshot({ path: "/tmp/snap-browser-failure.png" });
    console.error(await currentPage.locator("body").innerText());
  }
  console.error(
    JSON.stringify({ completed: results, error: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
