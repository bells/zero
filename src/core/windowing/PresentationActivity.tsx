import { createContext, type ReactNode } from "react";

export const PresentationEnabledContext = createContext(true);

export function PresentationActivity({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <PresentationEnabledContext.Provider value={enabled}>{children}</PresentationEnabledContext.Provider>;
}
