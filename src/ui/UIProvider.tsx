import type { ReactNode } from "react";
import { Toaster } from "./Toast.tsx";
import { TooltipProvider } from "./Tooltip.tsx";

/** App-wide providers for UI primitives. */
export function UIProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
