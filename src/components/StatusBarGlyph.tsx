import type { StatusBarIconId } from "../plugins/pluginHost/contracts";

interface StatusBarGlyphProps {
  icon: StatusBarIconId;
}

export function StatusBarGlyph({ icon }: StatusBarGlyphProps) {
  return (
    <span
      className={`status-bar-glyph icon-${icon}`}
      aria-hidden="true"
    />
  );
}
