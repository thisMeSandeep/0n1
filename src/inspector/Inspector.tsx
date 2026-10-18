import { useSelection, useUi } from "../store/index.ts";
import { TraceView } from "../tracing/TraceViews.tsx";
import { ComponentView } from "./ComponentView.tsx";
import { ConnectionView } from "./ConnectionView.tsx";
import { MultiView } from "./MultiView.tsx";
import { SystemView } from "./SystemView.tsx";

/** Picks the inspector view for the current selection (UIUX §3). */
export function Inspector({ onClose }: { onClose: () => void }) {
  const nodeIds = useSelection((s) => s.nodeIds);
  const edgeIds = useSelection((s) => s.edgeIds);
  const total = nodeIds.length + edgeIds.length;
  const trace = useUi((s) => s.openTrace);

  if (trace) return <TraceView trace={trace} onClose={onClose} />;
  if (total > 1) return <MultiView nodeIds={nodeIds} edgeIds={edgeIds} onClose={onClose} />;
  if (nodeIds[0]) return <ComponentView key={nodeIds[0]} nodeId={nodeIds[0]} onClose={onClose} />;
  if (edgeIds[0]) return <ConnectionView key={edgeIds[0]} edgeId={edgeIds[0]} onClose={onClose} />;
  return <SystemView onClose={onClose} />;
}
