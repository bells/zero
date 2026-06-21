export type AppSurface = "tray" | "main" | "preferences" | "about" | "capture" | "pin";

export function resolveAppSurface(label: string): AppSurface {
  if (label === "main" || label === "preferences" || label === "about" || label === "capture") {
    return label;
  }

  if (label.startsWith("pin-")) {
    return "pin";
  }

  return "tray";
}
