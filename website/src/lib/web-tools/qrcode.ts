import QRCode from "qrcode";
import { fail, textFits, type Result } from "./contracts.ts";
export interface QrValue {
  text: string;
  size: number;
  modules: Uint8Array;
  svg: string;
}
export function createQr(input: string): Result<QrValue> {
  if (!input.length) return fail("empty");
  if (!input.isWellFormed()) return fail("utf8");
  if (!textFits(input, 2000)) return fail("limit");
  try {
    const qr = QRCode.create(
      [{ data: new TextEncoder().encode(input), mode: "byte" }],
      { errorCorrectionLevel: "M" },
    );
    const size = qr.modules.size;
    const paths: string[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (qr.modules.get(y, x)) paths.push(`M${x + 4} ${y + 4}h1v1h-1z`);
      }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 8} ${size + 8}" width="1024" height="1024" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size + 8}v${size + 8}H0z"/><path fill="#000" d="${paths.join("")}"/></svg>`;
    if (!textFits(svg, 4 * 1024 * 1024)) return fail("limit");
    return {
      ok: true,
      value: {
        text: input,
        size,
        modules: Uint8Array.from(qr.modules.data),
        svg,
      },
    };
  } catch {
    return fail("qrcode", { detail: "capacity" });
  }
}
