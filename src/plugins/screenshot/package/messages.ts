import type { Tool } from "./scene.js";

const zh = navigator.language.startsWith("zh");
document.documentElement.lang = zh ? "zh-CN" : "en";
export const words = zh ? {
  capture: "截取主屏幕", recapture: "重新截图", opening: "正在截图…", empty: "截取主屏幕，然后拖动选择区域。",
  editing: "拖动裁剪或绘图。用「移动」拖动已有标注。", textHint: "输入标注文字后，在截图上点击放置。",
  pinHint: "预览窗口已置顶。", copy: "复制图片", save: "保存 PNG", pin: "置顶预览", unpin: "取消置顶", undo: "撤销",
  redo: "重做", resetCrop: "清除裁剪", color: "颜色", lineWidth: "线宽", annotation: "标注文字",
  tools: "编辑工具", preview: "截图预览", working: "正在导出…", copied: "已复制到剪贴板。", saved: "已保存 PNG。",
  cancelled: "已取消保存。", windowsCapture: "打开系统截图工具", windowsOpened: "已请求打开系统截图工具。",
  windowsFailed: "无法打开截图工具，请重试。", startup: "Snap 无法启动，请重新打开工具。",
  permission: "请在 macOS「系统设置 → 隐私与安全性 → 屏幕与系统音频录制」中允许此 Zero 应用，再试一次。",
  focus: "请先激活 Snap 窗口后再截图。", expired: "截图已过期，请重新截图。",
  busy: "另一个截图或导出正在进行，请稍后再试。", error: "操作失败，请重试。",
} : {
  capture: "Capture main display", recapture: "New capture", opening: "Capturing…", empty: "Capture the main display, then drag to select an area.",
  editing: "Drag to crop or draw. Use Move to reposition an annotation.", textHint: "Enter text, then click the screenshot to place it.",
  pinHint: "The preview stays above other windows.", copy: "Copy image", save: "Save PNG", pin: "Keep on top", unpin: "Unpin", undo: "Undo",
  redo: "Redo", resetCrop: "Clear crop", color: "Color", lineWidth: "Line width", annotation: "Annotation text",
  tools: "Editing tools", preview: "Captured screenshot", working: "Exporting…", copied: "Copied to the clipboard.", saved: "PNG saved.",
  cancelled: "Save cancelled.", windowsCapture: "Open Snipping Tool", windowsOpened: "Windows received the request to open Snipping Tool.",
  windowsFailed: "Couldn’t open Snipping Tool. Try again.", startup: "Snap could not start. Reopen the tool to retry.",
  permission: "Allow this Zero app in macOS System Settings → Privacy & Security → Screen & System Audio Recording, then retry.",
  focus: "Activate the Snap window and try again.", expired: "This capture expired. Take a new screenshot.",
  busy: "A capture or export is already in progress. Try again in a moment.", error: "The operation failed. Try again.",
};

export const tools: Record<Tool, string> = zh ? {
  crop: "裁剪", move: "移动", rectangle: "矩形", ellipse: "椭圆", arrow: "箭头", pen: "画笔", text: "文字", mosaic: "马赛克",
} : {
  crop: "Crop", move: "Move", rectangle: "Rectangle", ellipse: "Ellipse", arrow: "Arrow", pen: "Pen", text: "Text", mosaic: "Mosaic",
};
