import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useState } from "react";
import { Canvas } from "../canvas/Canvas.tsx";
import { TimelineStrip } from "../chaos/TimelineStrip.tsx";
import { ImageExportDialog } from "../export/ImageExportDialog.tsx";
import { GuideSheet } from "../guide/GuideSheet.tsx";
import { RestoreDialog } from "../library/RestoreDialog.tsx";
import { PalettePanel } from "../palette/PalettePanel.tsx";
import { simulationStore } from "../simulation/store.ts";
import { selectionStore, uiStore, useUi } from "../store/index.ts";
import { TutorialsDialog } from "../tutorial/TutorialsDialog.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { DesktopNotice } from "./DesktopNotice.tsx";
import { LabShortcuts } from "./LabShortcuts.tsx";
import { InspectorPanel, OpenInspectorButton } from "./Panels.tsx";
import { TopBar } from "./TopBar.tsx";
import { useLabLayout } from "./useLabLayout.ts";

/** The lab frame: top bar, palette, canvas, inspector (UIUX §3). */
export function LabShell() {
  const layout = useLabLayout();
  const timelineOpen = useUi((s) => s.timelineOpen);
  const [continuedOnSmallScreen, setContinuedOnSmallScreen] = useState(false);

  // Below 1440px the inspector floats closed; selecting something opens it (UIUX §3).
  const { inspectorDocked, openInspector } = layout;

  // Request traces (S42): one you asked for opens when it arrives; selecting
  // something else, or a new run, closes it.
  useEffect(() => {
    const offTraces = simulationStore.subscribe((state, previous) => {
      const newest = state.traces[0];
      if (newest && newest !== previous.traces[0] && newest.reason === "asked") {
        uiStore.getState().setOpenTrace(newest);
        openInspector();
      } else if (state.traces.length === 0 && previous.traces.length > 0) {
        uiStore.getState().setOpenTrace(null);
      }
    });
    const offSelection = selectionStore.subscribe((selection, previous) => {
      if (selection.nodeIds !== previous.nodeIds || selection.edgeIds !== previous.edgeIds) {
        uiStore.getState().setOpenTrace(null);
      }
    });
    return () => {
      offTraces();
      offSelection();
    };
  }, [openInspector]);

  // Clicking a component opens the inspector, wherever it's docked, if it was closed.
  useEffect(
    () =>
      uiStore.subscribe((ui, previous) => {
        if (ui.inspectorRequest !== previous.inspectorRequest) openInspector();
      }),
    [openInspector],
  );

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
      {/*
        relative + overflow-clip: anything placed against the page lands inside this
        frame and is clipped by it, so it can never make the page taller and give the
        browser something to scroll (focusing a field reaches it even through hidden).
      */}
      <div className="relative flex h-dvh flex-col overflow-clip bg-canvas text-fg">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <PalettePanel open={layout.paletteOpen} onToggle={layout.togglePalette} />
          <main aria-label="Canvas" className="relative flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <Canvas />
              {!layout.inspectorOpen && <OpenInspectorButton onClick={layout.toggleInspector} />}
            </div>
            {timelineOpen && <TimelineStrip />}
            {!layout.inspectorDocked && inspector}
          </main>
          {layout.inspectorDocked && inspector}
        </div>
        <CommandPalette />
        <RestoreDialog />
        <GuideSheet />
        <TutorialsDialog />
        <ImageExportDialog />
        <LabShortcuts
          paletteOpen={layout.paletteOpen}
          togglePalette={layout.togglePalette}
          toggleInspector={layout.toggleInspector}
        />
      </div>
    </ReactFlowProvider>
  );
}
