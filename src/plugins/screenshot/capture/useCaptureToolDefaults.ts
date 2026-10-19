import { useRef, useState } from "react";
import {
  INITIAL_TOOL_DEFAULTS,
  normalizeToolStyle,
  recordOf,
  type ToolDefaults,
} from "./captureAnnotationProperties";
import { readToolDefaults, saveToolDefaults } from "./captureToolDefaults";
import type { DrawingTool } from "./captureTypes";

const storage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};

export function useCaptureToolDefaults() {
  const [styles, setStyles] = useState(() => readToolDefaults(storage));
  const values = useRef(styles);
  const original = useRef<{ tool: DrawingTool; values: ToolDefaults } | null>(
    null,
  );
  const [active, setActive] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const save = () => setSaveFailed(!saveToolDefaults(storage, values.current));
  const assign = (next: ToolDefaults) => {
    values.current = next;
    setStyles(next);
  };
  const commit = () => {
    if (!original.current) return;
    const changed =
      JSON.stringify(original.current.values) !==
      JSON.stringify(values.current);
    original.current = null;
    setActive(false);
    if (changed) save();
  };
  return {
    styles,
    active,
    saveFailed,
    dismissFailure: () => setSaveFailed(false),
    begin: (tool: DrawingTool) => {
      commit();
      original.current = { tool, values: values.current };
      setActive(true);
    },
    patch: (tool: DrawingTool, patch: unknown) => {
      assign({
        ...values.current,
        [tool]: normalizeToolStyle(tool, {
          ...values.current[tool],
          ...recordOf(patch),
        }),
      });
    },
    commit,
    cancel: () => {
      if (original.current) assign(original.current.values);
      original.current = null;
      setActive(false);
    },
    reset: (tool: DrawingTool) => {
      original.current = null;
      setActive(false);
      assign({ ...values.current, [tool]: { ...INITIAL_TOOL_DEFAULTS[tool] } });
      save();
    },
  };
}
