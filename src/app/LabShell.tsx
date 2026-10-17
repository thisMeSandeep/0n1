import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useState } from "react";
import { Canvas } from "../canvas/Canvas.tsx";
import { RestoreDialog } from "../library/RestoreDialog.tsx";
import { PalettePanel } from "../palette/PalettePanel.tsx";
import { selectionStore } from "../store/index.ts";
import { CommandPalette } from "./CommandPalette.tsx";
import { DesktopNotice } from "./DesktopNotice.tsx";
import { LabShortcuts } from "./LabShortcuts.tsx";
import { InspectorPanel, OpenInspectorButton } from "./Panels.tsx";
import { TopBar } from "./TopBar.tsx";
import { useLabLayout } from "./useLabLayout.ts";

/** The lab frame: top bar, palette, canvas, inspector (UIUX §3). */
export function LabShell() {
  const layout = useLabLayout();
  const [continuedOnSmallScreen, setContinuedOnSmallScreen] = useState(false);

  // Below 1440px the inspector floats closed; selecting something opens it (UIUX §3).
  const { inspectorDocked, openInspector } = layout;
  useEffect(() => {
    if (inspectorDocked) return;
    return selectionStore.subscribe((selection, previous) => {
      const changed =
        selection.nodeIds !== previous.nodeIds || selection.edgeIds !== previous.edgeIds;
      if (changed && selection.nodeIds.length + selection.edgeIds.length > 0) openInspector();
    });
  }, [inspectorDocked, openInspector]);

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

  // The provider lets the palette (outside the canvas) place components in view.
  return (
    <ReactFlowProvider>
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
        <CommandPalette />
        <RestoreDialog />
        <LabShortcuts
          paletteOpen={layout.paletteOpen}
          togglePalette={layout.togglePalette}
          toggleInspector={layout.toggleInspector}
        />
      </div>
    </ReactFlowProvider>
  );
}
