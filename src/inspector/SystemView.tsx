import { useLive } from "../simulation/index.ts";
import { designStore, useDesign } from "../store/index.ts";
import { EditableTitle } from "./EditableTitle.tsx";
import { InspectorHeader } from "./InspectorHeader.tsx";
import { ClientTraffic, HealthSummary, SystemCharts } from "./SystemLive.tsx";
import { count } from "./sections.ts";

/** Nothing selected: the system as a whole, and while running its health, traffic and charts. */
export function SystemView({ onClose }: { onClose: () => void }) {
  const id = useDesign((s) => s.doc.id);
  const name = useDesign((s) => s.doc.name);
  const nodes = useDesign((s) => s.doc.nodes.length);
  const edges = useDesign((s) => s.doc.edges.length);
  const started = useLive((s) => s.started);

  return (
    <>
      <InspectorHeader
        title={
          <EditableTitle
            // A new system means a fresh field: never carry a half-typed name across.
            key={id}
            label="System name"
            value={name}
            onCommit={(next) => designStore.getState().renameSystem(next)}
          />
        }
        subtitle={`${count(nodes, "component")} · ${count(edges, "connection")}`}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        {started ? (
          <>
            <HealthSummary />
            <ClientTraffic />
            <SystemCharts />
          </>
        ) : (
          <p className="pt-6 text-base text-fg-2">
            {nodes === 0
              ? "Add components from the left panel to start building."
              : "Select a component to see its settings, or press Space to run the system."}
          </p>
        )}
      </div>
    </>
  );
}
