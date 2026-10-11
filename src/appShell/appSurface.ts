export type AppSurface = "tray" | "main" | "about" | "capture" | "pin" | "launcher" | "paper";

export function resolveAppSurface(label: string): AppSurface {
  if (label === "main" || label === "about" || label === "capture" || label === "launcher" || label === "paper") {
    return label;
  }

  if (label.startsWith("pin-")) {
    return "pin";
  }

  return "tray";
}
