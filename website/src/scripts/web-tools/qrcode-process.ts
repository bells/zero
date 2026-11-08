import { createQr } from "../../lib/web-tools/qrcode";
import { inspectImageInput } from "../../lib/web-tools/image-input";
import { fail, textFits, type Result } from "../../lib/web-tools/contracts";
import type { EverydayValue } from "../../lib/web-tools/everyday-contracts";

export async function processQr(
  options: { mode: "generate"; input: string } | { mode: "decode"; file: Blob },
): Promise<Result<EverydayValue>> {
  let bitmap: ImageBitmap | undefined;
  let canvas: OffscreenCanvas | undefined;
  let decoder: Worker | undefined;
  try {
    if (options.mode === "generate") {
      const result = createQr(options.input);
      if (!result.ok) return result;
      const { size, modules, svg, text } = result.value;
      canvas = new OffscreenCanvas(1024, 1024);
      const context = canvas.getContext("2d");
      if (!context) return fail("worker");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 1024, 1024);
      const scale = Math.floor(1024 / (size + 8));
      const origin = Math.floor((1024 - size * scale) / 2);
      context.fillStyle = "#000";
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          if (modules[y * size + x])
            context.fillRect(
              origin + x * scale,
              origin + y * scale,
              scale,
              scale,
            );
        }
      const png = await canvas.convertToBlob({ type: "image/png" });
      if (png.size > 4 * 1024 * 1024) return fail("limit");
      return { ok: true, value: { text, png, svg } };
    }
    if (options.file.size > 16 * 1024 * 1024) return fail("limit");
    const inspection = inspectImageInput(
      new Uint8Array(await options.file.arrayBuffer()),
    );
    if (!inspection.ok)
      return fail(inspection.error.code === "limit" ? "limit" : "qrcode", {
        detail: "image",
      });
    if (
      inspection.value.format === "heic" ||
      inspection.value.format === "heif"
    )
      return fail("qrcode", { detail: "image" });
    bitmap = await createImageBitmap(options.file);
    if (
      bitmap.width * bitmap.height > 12200000 ||
      Math.max(bitmap.width, bitmap.height) > 8192
    )
      return fail("limit");
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fail("worker");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    decoder = (
      await import("qr-scanner/qr-scanner-worker.min.js")
    ).createWorker();
    const engine = decoder;
    const text = await new Promise<string | null>((resolve, reject) => {
      engine.onmessage = (
        event: MessageEvent<{ id: number; type: string; data: string | null }>,
      ) => {
        if (event.data.id === 1 && event.data.type === "qrResult")
          resolve(event.data.data);
      };
      engine.onerror = (event) => {
        event.preventDefault();
        reject(new Error("decoder"));
      };
      engine.postMessage({ id: 0, type: "inversionMode", data: "both" });
      engine.postMessage({ id: 1, type: "decode", data: pixels }, [
        pixels.data.buffer,
      ]);
    });
    if (text === null) return fail("qrcode", { detail: "not-found" });
    if (!text.isWellFormed()) return fail("utf8");
    return textFits(text, 65536)
      ? { ok: true, value: { text } }
      : fail("limit");
  } catch {
    return fail("qrcode", { detail: "image" });
  } finally {
    decoder?.terminate();
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
