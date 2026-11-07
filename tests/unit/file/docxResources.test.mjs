import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const outputRoot = process.env.ZERO_QUALITY_TEST_ROOT ?? "/private/tmp/zero-tests";
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "docx-preview") return { url: "data:text/javascript,export const renderAsync=(...args)=>globalThis.zeroTestDocxRenderer(...args)", shortCircuit: true };
    if (specifier === "./nativePrintLayout" && context.parentURL?.endsWith("/docxToPdf.js")) return nextResolve(`${specifier}.js`, context);
    return nextResolve(specifier, context);
  },
});
const { renderDocxForNativePrint, clearDocxRenderSurface } = await import(`${outputRoot}/plugins/file/engine/docxToPdf.js`);
hooks.deregister();

class Element {
  children = [];
  parent = undefined;
  className = "";
  scrollHeight = 1100;
  offsetHeight = 1100;
  append(child) { child.parent = this; this.children.push(child); }
  replaceChildren() { for (const child of this.children) child.parent = undefined; this.children = []; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = undefined; }
  querySelectorAll(selector) { return selector === "img" ? this.images ?? [] : []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 1100 }; }
}
function setup() {
  const root = new Element();
  globalThis.HTMLElement = Element;
  globalThis.document = {
    body: { classList: { add() {}, remove() {} } },
    getElementById: () => root,
    createElement: () => new Element(),
  };
  globalThis.window = { setTimeout, clearTimeout, scrollX: 0, scrollY: 0, innerHeight: 1100, getComputedStyle: () => ({ width: "800px", minHeight: "1100px" }) };
  return root;
}
const request = { protocolVersion: 3, token: "test-token", engineVersion: "1.3.0", jobId: "test-job" };

test("a cancelled DOCX renderer cannot later mutate the next job's render surface", async () => {
  const root = setup();
  let oldSurface;
  let finishOld;
  globalThis.zeroTestDocxRenderer = (_bytes, surface) => { oldSurface = surface; return new Promise(resolve => { finishOld = resolve; }); };
  const cancellation = new AbortController();
  const oldJob = renderDocxForNativePrint(new Uint8Array([1]), request, cancellation.signal);
  cancellation.abort();
  await assert.rejects(oldJob, error => error.name === "AbortError");
  clearDocxRenderSurface();
  let newSurface;
  globalThis.zeroTestDocxRenderer = async (_bytes, surface) => { newSurface = surface; };
  await renderDocxForNativePrint(new Uint8Array([2]), request, new AbortController().signal);
  oldSurface.append(new Element());
  finishOld();
  await Promise.resolve();
  assert.notEqual(oldSurface, newSurface);
  assert.equal(newSurface.children.length, 0);
  assert.equal(root.children.includes(oldSurface), false);
  clearDocxRenderSurface();
});

test("a decoded but empty embedded image fails conversion before native printing", async () => {
  setup();
  globalThis.zeroTestDocxRenderer = async (_bytes, surface) => { surface.images = [{ complete: true, naturalWidth: 0, naturalHeight: 0 }]; };
  await assert.rejects(renderDocxForNativePrint(new Uint8Array([1]), request, new AbortController().signal), /embedded image/);
});

test("a loaded embedded font is reported only after document font readiness", async () => {
  setup();
  let finishFonts;
  const fonts = [{ status: "loaded", family: '"Synthetic Embedded"' }, { status: "error", family: "Failed Font" }];
  fonts.ready = new Promise(resolve => { finishFonts = resolve; });
  document.fonts = fonts;
  globalThis.zeroTestDocxRenderer = async () => {};
  let loaded;
  const result = renderDocxForNativePrint(new Uint8Array([1]), request, new AbortController().signal, "macos", Date.now()+5000, families => { loaded = families; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(loaded, undefined);
  finishFonts();
  await result;
  assert.deepEqual(loaded, ["Synthetic Embedded"]);
  clearDocxRenderSurface();
});
