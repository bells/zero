import {
  DRAWING_TOOLS,
  normalizeToolStyle,
  recordOf,
  type ToolDefaults,
} from "./captureAnnotationProperties.js";
export const TOOL_DEFAULTS_KEY = "zero.snap.annotation-defaults.v1";
interface ReadStorage {
  getItem(key: string): string | null;
}
interface WriteStorage {
  setItem(key: string, value: string): void;
}
function normalizeDefaults(value: unknown): ToolDefaults {
  const source = recordOf(value);
  return Object.fromEntries(
    DRAWING_TOOLS.map((tool) => [tool, normalizeToolStyle(tool, source[tool])]),
  ) as ToolDefaults;
}
export function readToolDefaults(storage: ReadStorage): ToolDefaults {
  try {
    const raw = storage.getItem(TOOL_DEFAULTS_KEY);
    const data = recordOf(raw ? JSON.parse(raw) : null);
    return normalizeDefaults(data.version === 1 ? data.tools : null);
  } catch {
    return normalizeDefaults(null);
  }
}
export function saveToolDefaults(
  storage: WriteStorage,
  value: ToolDefaults,
): boolean {
  try {
    storage.setItem(
      TOOL_DEFAULTS_KEY,
      JSON.stringify({ version: 1, tools: normalizeDefaults(value) }),
    );
    return true;
  } catch {
    return false;
  }
}
