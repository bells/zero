import { registerPlugin, type PluginContext } from "@zero/sdk";
import { CaptureEditor } from "./editor.js";
import { tools, words } from "./messages.js";
import type { Tool } from "./scene.js";
import "./style.css";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing Snap control: ${id}`);
  return found as T;
}

const capture = element<HTMLButtonElement>("capture");
const status = element("status");
const windows = /Win/i.test(navigator.platform) || /Windows NT/i.test(navigator.userAgent);

function bindWindows({ bridge, signal }: PluginContext) {
  capture.textContent = words.windowsCapture;
  capture.disabled = false;
  capture.addEventListener("click", async () => {
    capture.disabled = true;
    status.textContent = "";
    const result = await bridge.request("screen.openSystemCapture", {});
    if (signal.aborted) return;
    capture.disabled = false;
    status.textContent = result.ok ? words.windowsOpened : words.windowsFailed;
  }, { signal });
}

function explain(code: string) {
  switch (code) {
    case "screen.permission": return words.permission;
    case "screen.focusRequired": return words.focus;
    case "screen.captureExpired":
    case "screen.leaseExpired": return words.expired;
    case "screen.busy": return words.busy;
    default: return words.error;
  }
}

function bindMac({ bridge, signal }: PluginContext) {
  const main = element("snap"), history = element("history"), editing = element("editing"), section = element("editor");
  const canvas = element<HTMLCanvasElement>("canvas");
  const color = element<HTMLInputElement>("color"), stroke = element<HTMLInputElement>("stroke"), text = element<HTMLInputElement>("text-value");
  const undo = element<HTMLButtonElement>("undo"), redo = element<HTMLButtonElement>("redo"), reset = element<HTMLButtonElement>("reset-crop");
  const copy = element<HTMLButtonElement>("copy"), save = element<HTMLButtonElement>("save"), pin = element<HTMLButtonElement>("pin");
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("button[data-tool]")];
  let tool: Tool = "crop";
  let activeId: string | null = null;
  let busy = false;
  let pinned = false;

  undo.textContent = words.undo;
  redo.textContent = words.redo;
  reset.textContent = words.resetCrop;
  copy.textContent = words.copy;
  save.textContent = words.save;
  element("color-label").textContent = words.color;
  element("stroke-label").textContent = words.lineWidth;
  element("tools").setAttribute("aria-label", words.tools);
  text.setAttribute("aria-label", words.annotation);
  text.placeholder = words.annotation;
  canvas.setAttribute("aria-label", words.preview);

  const editor = new CaptureEditor(canvas, () => ({
    tool, color: color.value, width: stroke.valueAsNumber, text: text.value,
  }), refresh, signal);

  function refresh() {
    const loaded = activeId !== null;
    capture.disabled = busy;
    capture.textContent = loaded ? words.recapture : words.capture;
    history.hidden = !loaded || pinned;
    section.hidden = !loaded;
    editing.hidden = pinned;
    undo.disabled = busy || !editor.canUndo;
    redo.disabled = busy || !editor.canRedo;
    reset.disabled = busy || !editor.crop;
    copy.disabled = save.disabled = pin.disabled = busy || !loaded;
    pin.textContent = pinned ? words.unpin : words.pin;
    pin.setAttribute("aria-pressed", String(pinned));
    main.dataset.pinned = String(pinned);
  }

  function chooseTool(next: Tool) {
    tool = next;
    main.dataset.tool = next;
    for (const button of modeButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.tool === next));
    }
    text.hidden = next !== "text";
    if (next === "text") {
      text.focus();
      status.textContent = words.textHint;
    } else if (activeId) {
      status.textContent = words.editing;
    }
  }

  for (const button of modeButtons) {
    const name = button.dataset.tool;
    if (!name || !Object.hasOwn(tools, name)) continue;
    const mode = name as Tool;
    button.textContent = tools[mode];
    button.addEventListener("click", () => chooseTool(mode), { signal });
  }

  undo.addEventListener("click", () => editor.undo(), { signal });
  redo.addEventListener("click", () => editor.redo(), { signal });
  reset.addEventListener("click", () => editor.resetCrop(), { signal });
  window.addEventListener("keydown", event => {
    if (!activeId || busy || pinned || event.target instanceof HTMLInputElement) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    }
  }, { signal });

  capture.addEventListener("click", async () => {
    busy = true;
    status.textContent = words.opening;
    refresh();
    try {
      if (activeId) {
        await bridge.request("screen.releaseCapture", { captureId: activeId });
        activeId = null;
        pinned = false;
        editor.clear();
        refresh();
      }
      const result = await bridge.request("screen.captureDisplay", {});
      if (signal.aborted) return;
      if (!result.ok) {
        status.textContent = explain(result.error.code);
        return;
      }
      const image = new Image();
      image.src = result.value.url;
      try {
        await image.decode();
        if (signal.aborted) {
          image.removeAttribute("src");
          return;
        }
        if (image.naturalWidth !== result.value.width || image.naturalHeight !== result.value.height) throw new Error();
        editor.load(image);
        activeId = result.value.captureId;
        chooseTool("crop");
        status.textContent = words.editing;
      } catch {
        image.removeAttribute("src");
        void bridge.request("screen.releaseCapture", { captureId: result.value.captureId });
        status.textContent = words.error;
      }
    } finally {
      busy = false;
      if (!signal.aborted) refresh();
    }
  }, { signal });

  async function exportCapture(action: "copy" | "save") {
    const captureId = activeId;
    if (!captureId || busy) return;
    busy = true;
    status.textContent = words.working;
    refresh();
    try {
      const bytes = await editor.pngBytes();
      try {
        if (signal.aborted || activeId !== captureId) return;
        const lease = await bridge.request("screen.prepareCaptureExport", { captureId, action });
        if (!lease.ok) {
          status.textContent = explain(lease.error.code);
          return;
        }
        if (bytes.length > lease.value.maxBytes) throw new Error();
        const result = await bridge.upload(lease.value.leaseId, bytes);
        if (signal.aborted) return;
        status.textContent = !result.ok ? explain(result.error.code)
          : result.value.cancelled ? words.cancelled : action === "copy" ? words.copied : words.saved;
      } finally {
        bytes.fill(0);
      }
    } catch {
      if (!signal.aborted) status.textContent = words.error;
    } finally {
      busy = false;
      if (!signal.aborted) refresh();
    }
  }

  copy.addEventListener("click", () => void exportCapture("copy"), { signal });
  save.addEventListener("click", () => void exportCapture("save"), { signal });
  pin.addEventListener("click", async () => {
    if (!activeId || busy) return;
    const desired = !pinned;
    busy = true;
    refresh();
    try {
      const result = await bridge.request("screen.setCapturePinned", { captureId: activeId, pinned: desired });
      if (signal.aborted) return;
      if (result.ok) {
        pinned = desired;
        editor.setPinned(pinned);
        status.textContent = pinned ? words.pinHint : words.editing;
      } else {
        status.textContent = explain(result.error.code);
      }
    } finally {
      busy = false;
      if (!signal.aborted) refresh();
    }
  }, { signal });

  status.textContent = words.empty;
  refresh();
}

const registration = registerPlugin({ activate: windows ? bindWindows : bindMac });
window.addEventListener("pagehide", registration.dispose, { once: true });
void registration.ready.then(result => {
  if (!result.ok) status.textContent = words.startup;
});
