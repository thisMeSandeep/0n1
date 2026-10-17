import { useState } from "react";
import { Canvas } from "../canvas/Canvas.tsx";
import { DesktopNotice } from "./DesktopNotice.tsx";
import { InspectorPanel, OpenInspectorButton, PalettePanel } from "./Panels.tsx";
import { TopBar } from "./TopBar.tsx";
import { useLabLayout } from "./useLabLayout.ts";

/** The lab frame: top bar, palette, canvas, inspector (UIUX §3). */
export function LabShell() {
  const layout = useLabLayout();
  const [continuedOnSmallScreen, setContinuedOnSmallScreen] = useState(false);

  if (layout.needsDesktopNotice && !continuedOnSmallScreen) {
    return <DesktopNotice onContinue={() => setContinuedOnSmallScreen(true)} />;
  }

  const inspector = (
    <InspectorPanel
      open={layout.inspectorOpen}
      docked={layout.inspectorDocked}
      onToggle={layout.toggleInspector}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <PalettePanel open={layout.paletteOpen} onToggle={layout.togglePalette} />
        <main aria-label="Canvas" className="relative min-w-0 flex-1">
          <Canvas />
          {!layout.inspectorOpen && <OpenInspectorButton onClick={layout.toggleInspector} />}
          {!layout.inspectorDocked && inspector}
        </main>
        {layout.inspectorDocked && inspector}
      </div>
    </div>
  );
}
