import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  PRESET_COLORS,
  PROPERTY_RANGES,
  parsePropertyNumber,
  recordOf,
  type AnnotationStyle,
  type NumericProperty,
} from "./captureAnnotationProperties";
import type { DrawingTool } from "./captureTypes";
import type { CaptureTranslationKey as TranslationKey } from "./i18n";

export interface AnnotationPanelContext {
  mode: "default" | "selected";
  tool: DrawingTool;
  style: AnnotationStyle;
  radiusMaximum?: number;
}
interface Props {
  context: AnnotationPanelContext;
  t: (key: TranslationKey) => string;
  style?: CSSProperties;
  disabled?: boolean;
  onBegin: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onCommit: () => void;
  onCancel: () => void;
  onReset: () => void;
}
interface NumericProps {
  field: NumericProperty;
  value: number;
  maximum?: number;
  label: string;
  invalidLabel: string;
  sliderLabel: string;
  disabled?: boolean;
  onBegin: () => void;
  onValue: (value: number) => void;
  onCommit: () => void;
  onCancel: () => void;
}
function NumericControl({
  field,
  value,
  maximum,
  label,
  invalidLabel,
  sliderLabel,
  disabled,
  onBegin,
  onValue,
  onCommit,
  onCancel,
}: NumericProps) {
  const [text, setText] = useState(String(value)),
    [invalid, setInvalid] = useState(false);
  const editing = useRef(false),
    initial = useRef(value),
    skipBlur = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);
  const begin = () => {
    if (!editing.current) {
      initial.current = value;
      editing.current = true;
      skipBlur.current = false;
      onBegin();
    }
  };
  const commit = () => {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    if (!editing.current) return;
    const result = parsePropertyNumber(field, text, initial.current, maximum);
    if (!result.valid) {
      editing.current = false;
      setInvalid(true);
      return;
    }
    onValue(result.value);
    editing.current = false;
    setText(String(result.value));
    setInvalid(false);
    onCommit();
  };
  const cancel = () => {
    editing.current = false;
    skipBlur.current = true;
    setText(String(initial.current));
    setInvalid(false);
    onCancel();
  };
  return (
    <div className="capture-property-number">
      <label>
        {label}
        <input
          type="number"
          min={PROPERTY_RANGES[field][0]}
          max={maximum ?? PROPERTY_RANGES[field][1]}
          step="1"
          aria-label={label}
          aria-invalid={invalid}
          title={invalid ? invalidLabel : label}
          value={text}
          disabled={disabled}
          onFocus={begin}
          onChange={(e) => {
            begin();
            const next = e.target.value;
            setText(next);
            const result = parsePropertyNumber(
              field,
              next,
              initial.current,
              maximum,
            );
            setInvalid(!result.valid);
            onValue(result.valid ? result.value : initial.current);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
              e.currentTarget.blur();
            } else if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Tab") commit();
          }}
        />
      </label>
      <input
        type="range"
        aria-label={`${label} · ${sliderLabel}`}
        min={PROPERTY_RANGES[field][0]}
        max={maximum ?? PROPERTY_RANGES[field][1]}
        step="1"
        value={value}
        disabled={disabled}
        onFocus={begin}
        onPointerDown={begin}
        onChange={(e) => {
          begin();
          const next = Number(e.target.value);
          setText(String(next));
          setInvalid(false);
          onValue(next);
        }}
        onPointerUp={() => {
          editing.current = false;
          setInvalid(false);
          onCommit();
        }}
        onBlur={() => {
          if (editing.current) {
            editing.current = false;
            onCommit();
          }
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={() => {
          if (editing.current) cancel();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
            e.currentTarget.blur();
          } else if (e.key === "Enter") {
            editing.current = false;
            onCommit();
          }
        }}
      />
      {invalid ? (
        <span className="capture-property-invalid" role="alert">
          {invalidLabel}
        </span>
      ) : null}
    </div>
  );
}
export function AnnotationPropertiesPanel(props: Props) {
  const {
    context,
    t,
    onBegin,
    onPatch,
    onCommit,
    onCancel,
    onReset,
    disabled,
  } = props;
  const values = recordOf(context.style);
  const title = t(`screenshot.toolbar.${context.tool}`);
  const discrete = (patch: Record<string, unknown>) => {
    onBegin();
    onPatch(patch);
    onCommit();
  };
  return (
    <section
      className="capture-annotation-properties"
      data-annotation-edit-domain="true"
      aria-label={`${title} · ${t(`screenshot.properties.${context.mode}`)}`}
      style={props.style}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <header>
        <strong>{title}</strong>
        <span>{t(`screenshot.properties.${context.mode}`)}</span>
      </header>
      <div className="capture-property-fields">
        {(
          [
            "strokeWidth",
            "fontSize",
            "opacity",
            "pixelSize",
            "cornerRadius",
          ] as NumericProperty[]
        )
          .filter((field) => field in values)
          .map((field) => (
            <NumericControl
              key={field}
              field={field}
              value={Number(values[field])}
              maximum={
                field === "cornerRadius" ? context.radiusMaximum : undefined
              }
              label={t(`screenshot.properties.${field}`)}
              invalidLabel={t("screenshot.properties.invalid")}
              sliderLabel={t("screenshot.properties.slider")}
              disabled={disabled}
              onBegin={onBegin}
              onValue={(value) => onPatch({ [field]: value })}
              onCommit={onCommit}
              onCancel={onCancel}
            />
          ))}
      </div>
      {"color" in values ? (
        <div
          className="capture-property-colors"
          role="group"
          aria-label={t("screenshot.properties.color")}
        >
          {PRESET_COLORS.map((color) => (
            <button
              type="button"
              key={color}
              aria-label={`${t("screenshot.properties.color")} ${color}`}
              aria-pressed={values.color === color}
              title={color}
              disabled={disabled}
              className="capture-color-swatch"
              style={{ "--swatch": color } as CSSProperties}
              onClick={() => discrete({ color })}
            >
              {values.color === color ? "✓" : ""}
            </button>
          ))}
          <label className="capture-custom-color">
            {t("screenshot.properties.customColor")}
            <input
              type="color"
              value={String(values.color)}
              aria-label={t("screenshot.properties.customColor")}
              disabled={disabled}
              onFocus={onBegin}
              onChange={(e) => onPatch({ color: e.target.value })}
              onBlur={onCommit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") {
                  e.preventDefault();
                  onCancel();
                  e.currentTarget.blur();
                }
              }}
            />
          </label>
        </div>
      ) : null}
      <div className="capture-property-options">
        {"fillMode" in values ? (
          <label>
            {t("screenshot.properties.fillMode")}
            <select
              aria-label={t("screenshot.properties.fillMode")}
              value={String(values.fillMode)}
              disabled={disabled}
              onChange={(e) => discrete({ fillMode: e.target.value })}
            >
              <option value="outline">
                {t("screenshot.properties.outline")}
              </option>
              <option value="solid">{t("screenshot.properties.solid")}</option>
            </select>
          </label>
        ) : null}
        {"heads" in values ? (
          <label>
            {t("screenshot.properties.heads")}
            <select
              aria-label={t("screenshot.properties.heads")}
              value={String(values.heads)}
              disabled={disabled}
              onChange={(e) => discrete({ heads: e.target.value })}
            >
              <option value="single">
                {t("screenshot.properties.single")}
              </option>
              <option value="double">
                {t("screenshot.properties.double")}
              </option>
            </select>
          </label>
        ) : null}
        {"bold" in values ? (
          <label>
            <input
              type="checkbox"
              checked={Boolean(values.bold)}
              disabled={disabled}
              onChange={(e) => discrete({ bold: e.target.checked })}
            />
            {t("screenshot.properties.bold")}
          </label>
        ) : null}
        <button
          type="button"
          className="capture-property-reset"
          disabled={disabled}
          onClick={onReset}
        >
          {t("screenshot.properties.reset")} · {title}
        </button>
      </div>
    </section>
  );
}
