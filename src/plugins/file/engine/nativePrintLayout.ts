import type { FileEnginePageRect } from "./engineContracts";

export function nativePrintGeometry(platform: "macos" | "windows" | "unsupported", pages: readonly FileEnginePageRect[]): FileEnginePageRect[] {
  if (platform === "unsupported" || pages.length === 0 || pages.length > 512 || pages.some(page =>
    ![page.x,page.y,page.width,page.height].every(Number.isFinite) || page.x<0 || page.y<0 || page.width<=0 || page.height<=0 || page.width>20_000 || page.height>20_000)) throw new Error("unsupportedInput");
  if (platform === "windows") {
    const first=pages[0];
    if (pages.some(page => Math.abs(page.width-first.width)>1 || Math.abs(page.height-first.height)>1)) throw new Error("unsupportedInput");
  }
  const scale=platform === "macos" ? 72/96 : 1;
  return pages.map(page => ({x:page.x*scale,y:page.y*scale,width:page.width*scale,height:page.height*scale}));
}
