import type {
  AnnotationObject,
  CaptureTool,
  DrawingAnnotation,
  DrawingTool,
} from "./captureTypes";

interface ColoredStyle {
  color: string;
  opacity: number;
}
interface StrokeStyle extends ColoredStyle {
  strokeWidth: number;
}
export interface ToolStyleMap {
  rectangle: StrokeStyle & {
    fillMode: "outline" | "solid";
    cornerRadius: number;
  };
  ellipse: StrokeStyle & { fillMode: "outline" | "solid" };
  arrow: StrokeStyle & { heads: "single" | "double" };
  pen: StrokeStyle;
  text: ColoredStyle & { fontSize: number; bold: boolean };
  mosaic: { pixelSize: number };
}
export type ToolDefaults = { [K in DrawingTool]: ToolStyleMap[K] };
export type AnnotationStyle = ToolStyleMap[DrawingTool];
export type NumericProperty =
  "strokeWidth" | "opacity" | "fontSize" | "pixelSize" | "cornerRadius";
export const DRAWING_TOOLS: DrawingTool[] = [
  "rectangle",
  "ellipse",
  "arrow",
  "pen",
  "text",
  "mosaic",
];
export const PRESET_COLORS = [
  "#ff5252",
  "#ffeb3b",
  "#55f280",
  "#448aff",
  "#000000",
];
export const INITIAL_TOOL_DEFAULTS: ToolDefaults = {
  rectangle: {
    color: "#ff5252",
    strokeWidth: 4,
    opacity: 100,
    fillMode: "outline",
    cornerRadius: 0,
  },
  ellipse: {
    color: "#ff5252",
    strokeWidth: 4,
    opacity: 100,
    fillMode: "outline",
  },
  arrow: { color: "#ff5252", strokeWidth: 5, opacity: 100, heads: "single" },
  pen: { color: "#ff5252", strokeWidth: 5, opacity: 100 },
  text: { color: "#ff5252", fontSize: 24, opacity: 100, bold: false },
  mosaic: { pixelSize: 14 },
};
export const PROPERTY_RANGES: Record<
  NumericProperty,
  readonly [number, number]
> = {
  strokeWidth: [1, 32],
  opacity: [1, 100],
  fontSize: [12, 96],
  pixelSize: [4, 64],
  cornerRadius: [0, 100],
};
export function isDrawingTool(tool: CaptureTool): tool is DrawingTool {
  return tool !== "select" && tool !== "pin";
}
export function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function parsePropertyNumber(
  field: NumericProperty,
  input: string,
  previous: number,
  maximum?: number,
): { valid: boolean; value: number } {
  const value = input.trim() === "" ? NaN : Number(input);
  if (!Number.isFinite(value) || !Number.isInteger(value))
    return { valid: false, value: previous };
  const [min, max] = PROPERTY_RANGES[field];
  return {
    valid: true,
    value: Math.max(
      min,
      Math.min(value, maximum === undefined ? max : Math.min(max, maximum)),
    ),
  };
}
export function normalizeToolStyle<K extends DrawingTool>(
  tool: K,
  value: unknown,
): ToolStyleMap[K] {
  const source = recordOf(value);
  const result: Record<string, unknown> = { ...INITIAL_TOOL_DEFAULTS[tool] };
  for (const field of Object.keys(result)) {
    const candidate = source[field];
    if (field in PROPERTY_RANGES && typeof candidate === "number") {
      const parsed = parsePropertyNumber(
        field as NumericProperty,
        String(candidate),
        Number(result[field]),
      );
      if (parsed.valid) result[field] = parsed.value;
    } else if (
      field === "color" &&
      typeof candidate === "string" &&
      /^#[a-f\d]{6}$/i.test(candidate)
    )
      result[field] = candidate.toLowerCase();
    else if (
      field === "fillMode" &&
      (candidate === "outline" || candidate === "solid")
    )
      result[field] = candidate;
    else if (
      field === "heads" &&
      (candidate === "single" || candidate === "double")
    )
      result[field] = candidate;
    else if (field === "bold" && typeof candidate === "boolean")
      result[field] = candidate;
  }
  return result as unknown as ToolStyleMap[K];
}
export function annotationStyle(
  annotation: DrawingAnnotation,
): AnnotationStyle {
  return normalizeToolStyle(annotation.type, {
    ...annotation,
    ...("opacity" in annotation
      ? { opacity: Math.round(annotation.opacity * 100) }
      : {}),
  });
}
export function patchAnnotationStyle<T extends DrawingAnnotation>(
  annotation: T,
  patch: unknown,
): T {
  const style = normalizeToolStyle(annotation.type, {
    ...annotationStyle(annotation),
    ...recordOf(patch),
  });
  const result = {
    ...annotation,
    ...style,
    ...("opacity" in style ? { opacity: style.opacity / 100 } : {}),
  };
  if (result.type === "rectangle")
    result.cornerRadius = Math.min(
      result.cornerRadius,
      Math.floor(Math.min(result.width, result.height) / 2),
    );
  return result as T;
}
export function normalizeAnnotation<T extends AnnotationObject>(
  annotation: T,
): T {
  if (annotation.type === "pin") return annotation;
  const input = recordOf(annotation);
  const style = normalizeToolStyle(annotation.type, {
    ...input,
    opacity:
      typeof input.opacity === "number" ? Math.round(input.opacity * 100) : 100,
  });
  const result = {
    ...annotation,
    ...style,
    ...("opacity" in style ? { opacity: style.opacity / 100 } : {}),
  };
  if (result.type === "rectangle")
    result.cornerRadius = Math.max(
      0,
      Math.min(
        result.cornerRadius,
        Math.floor(Math.min(result.width, result.height) / 2),
      ),
    );
  return result as T;
}
