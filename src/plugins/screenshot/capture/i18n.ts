import {
  createMessageTranslator,
  type LocalizedMessages,
  type ResolvedLanguage,
} from "../../../core/preferences/i18n";
import { screenshotMessages } from "../i18n";

const captureMessages = {
  "zh-CN": {
    ...screenshotMessages["zh-CN"],
    "screenshot.properties.slider": "滑杆",
    "screenshot.properties.default": "默认样式",
    "screenshot.properties.selected": "已选标注",
    "screenshot.properties.strokeWidth": "线宽 · px",
    "screenshot.properties.fontSize": "字号 · px",
    "screenshot.properties.opacity": "不透明度 · %",
    "screenshot.properties.pixelSize": "像素块 · px",
    "screenshot.properties.cornerRadius": "标注圆角 · px",
    "screenshot.properties.invalid": "请输入范围内的整数；Esc 恢复",
    "screenshot.properties.color": "颜色",
    "screenshot.properties.customColor": "自定义颜色",
    "screenshot.properties.fillMode": "形状",
    "screenshot.properties.outline": "空心",
    "screenshot.properties.solid": "实心",
    "screenshot.properties.heads": "箭头方向",
    "screenshot.properties.single": "单向",
    "screenshot.properties.double": "双向",
    "screenshot.properties.bold": "粗体",
    "screenshot.properties.reset": "恢复工具默认值",
    "screenshot.properties.saveFailed":
      "样式未能保存，下次截图可能无法恢复。当前仍可继续绘制。",
    "screenshot.properties.dismiss": "关闭提示",
    "screenshot.properties.renderFailed":
      "标注渲染失败，请重试或撤销本次修改。",
    "screenshot.properties.textHint": "Enter 换行 · ⌘Enter 完成 · Esc 回滚",
    "screenshot.properties.object": "已选标注控制框",
  },
  "en-US": {
    ...screenshotMessages["en-US"],
    "screenshot.properties.slider": "slider",
    "screenshot.properties.default": "Drawing defaults",
    "screenshot.properties.selected": "Selected annotation",
    "screenshot.properties.strokeWidth": "Stroke width · px",
    "screenshot.properties.fontSize": "Font size · px",
    "screenshot.properties.opacity": "Opacity · %",
    "screenshot.properties.pixelSize": "Pixel block · px",
    "screenshot.properties.cornerRadius": "Object radius · px",
    "screenshot.properties.invalid":
      "Enter an integer in range; Esc restores the value",
    "screenshot.properties.color": "Color",
    "screenshot.properties.customColor": "Custom color",
    "screenshot.properties.fillMode": "Shape",
    "screenshot.properties.outline": "Outline",
    "screenshot.properties.solid": "Solid",
    "screenshot.properties.heads": "Arrowheads",
    "screenshot.properties.single": "Single",
    "screenshot.properties.double": "Double",
    "screenshot.properties.bold": "Bold",
    "screenshot.properties.reset": "Restore tool defaults",
    "screenshot.properties.saveFailed":
      "Style could not be remembered. You can keep drawing in this session.",
    "screenshot.properties.dismiss": "Dismiss notice",
    "screenshot.properties.renderFailed":
      "Annotations could not be rendered. Retry or undo the edit.",
    "screenshot.properties.textHint":
      "Enter for newline · ⌘Enter to finish · Esc to revert",
    "screenshot.properties.object": "Selected annotation controls",
  },
} as const satisfies LocalizedMessages;

export type CaptureTranslationKey = keyof (typeof captureMessages)["zh-CN"];
export function createCaptureTranslator(language: ResolvedLanguage) {
  return createMessageTranslator(language, captureMessages);
}
