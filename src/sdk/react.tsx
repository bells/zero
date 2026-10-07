import { createContext, useContext } from "react";
import type { PluginContext } from "./index";

export const ZeroPluginContext = createContext<Readonly<PluginContext> | null>(null);
export const ZeroPluginProvider = ZeroPluginContext.Provider;
export function useZeroPlugin(): Readonly<PluginContext> {
  const context = useContext(ZeroPluginContext);
  if (!context) throw new Error("useZeroPlugin requires ZeroPluginProvider");
  return context;
}
