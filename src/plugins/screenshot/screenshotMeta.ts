export const SCREENSHOT_SHORTCUT = {
  accelerator: "CommandOrControl+Shift+A",
  display: "⌘/Ctrl + Shift + A",
} as const;

export const SCREENSHOT_USAGE_ITEMS = [
  "通过菜单栏或快捷键开始截图，单击选择窗口，拖动自由框选。",
  "在选区中添加标注，确认后复制；也可以保存图片或钉在屏幕上。",
  "Esc 取消截图；OCR 识别原始文字，结果在此校对后复制。",
] as const;

export const SCREENSHOT_USAGE_KEYS = [
  "screenshot.usage.1",
  "screenshot.usage.2",
  "screenshot.usage.3",
] as const;
