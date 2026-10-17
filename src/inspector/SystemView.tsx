import { designStore, useDesign } from "../store/index.ts";
import { EditableTitle } from "./EditableTitle.tsx";
import { InspectorHeader } from "./InspectorHeader.tsx";
import { count } from "./sections.ts";

/** Nothing selected: the system as a whole. Health and traffic arrive in S32. */
export function SystemView({ onClose }: { onClose: () => void }) {
  const name = useDesign((s) => s.doc.name);
  const nodes = useDesign((s) => s.doc.nodes.length);
  const edges = useDesign((s) => s.doc.edges.length);

  return (
    <>
      <InspectorHeader
        title={
          <EditableTitle
            label="System name"
            value={name}
            onCommit={(next) => designStore.getState().renameSystem(next)}
          />
        }
        subtitle={`${count(nodes, "component")} · ${count(edges, "connection")}`}
        onClose={onClose}
      />
      <p className="px-5 pt-6 text-base text-fg-2">
        {nodes === 0
          ? "Add components from the left panel to start building."
          : "Select a component to see its settings."}
      </p>
    </>
  );
}
