import { memo, useLayoutEffect, useRef } from "react";
import { AnnotationPropertiesPanel } from "./AnnotationPropertiesPanel";
import {
  DRAWING_TOOLS,
  INITIAL_TOOL_DEFAULTS,
} from "./captureAnnotationProperties";
import type { Size } from "./captureSelectionModel";
import type { CaptureTranslationKey } from "./i18n";
const noop = () => {};
export const CapturePropertyMeasurements = memo(
  function CapturePropertyMeasurements({
    t,
    onMeasure,
  }: {
    t: (key: CaptureTranslationKey) => string;
    onMeasure: (size: Size) => void;
  }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      const nodes = ref.current?.querySelectorAll<HTMLElement>(
        ".capture-property-measurement",
      );
      if (!nodes) return;
      const measure = () => {
        let width = 0,
          height = 0;
        nodes.forEach((node) => {
          const rect = node.getBoundingClientRect();
          width = Math.max(width, rect.width);
          height = Math.max(height, rect.height);
        });
        if (width && height) onMeasure({ width, height });
      };
      const observer = new ResizeObserver(measure);
      nodes.forEach((node) => observer.observe(node));
      measure();
      return () => observer.disconnect();
    }, [t, onMeasure]);
    return (
      <div
        ref={ref}
        className="capture-property-measurements"
        inert
        aria-hidden="true"
      >
        {DRAWING_TOOLS.flatMap((tool) =>
          (["default", "selected"] as const).map((mode) => (
            <div
              key={`${tool}:${mode}`}
              className="capture-property-measurement"
            >
              <div className="capture-property-content">
                <AnnotationPropertiesPanel
                  context={{ mode, tool, style: INITIAL_TOOL_DEFAULTS[tool] }}
                  t={t}
                  disabled
                  onBegin={noop}
                  onPatch={noop}
                  onCommit={noop}
                  onCancel={noop}
                  onReset={noop}
                  measurement
                />
              </div>
            </div>
          )),
        )}
      </div>
    );
  },
);
