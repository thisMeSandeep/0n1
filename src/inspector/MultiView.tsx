import { CopyIcon, PowerIcon, TrashIcon } from "@phosphor-icons/react";
import { shortcutKeys } from "../app/shortcuts.ts";
import { simulation, useLive } from "../simulation/index.ts";
import { designStore, selectionStore, useDesign } from "../store/index.ts";
import { Button } from "../ui/Button.tsx";
import { InspectorHeader } from "./InspectorHeader.tsx";
import { count } from "./sections.ts";

type MultiViewProps = {
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  onClose: () => void;
};

/** Several things selected: a count and bulk actions. */
export function MultiView({ nodeIds, edgeIds, onClose }: MultiViewProps) {
  // The selection can include sticky notes (M04), which aren't components.
  const docNodes = useDesign((s) => s.doc.nodes);
  const components = nodeIds.filter((id) => docNodes.some((n) => n.id === id));
  const notes = nodeIds.length - components.length;
  const parts = [
    components.length > 0 && count(components.length, "component"),
    notes > 0 && count(notes, "note"),
    edgeIds.length > 0 && count(edgeIds.length, "connection"),
  ].filter(Boolean);

  const duplicate = () => {
    const copies = designStore.getState().duplicateNodes(components);
    selectionStore.getState().select({ nodeIds: copies, edgeIds: [] });
  };
  const allDown = useLive(
    (s) => components.length > 0 && components.every((id) => s.nodes[id]?.status === "down"),
  );
  const remove = () => {
    const actions = designStore.getState();
    actions.disconnect(edgeIds);
    actions.removeNodes(nodeIds);
  };

  return (
    <>
      <InspectorHeader
        title={
          <h2 className="px-1.5 text-md leading-7 font-semibold">
            {nodeIds.length + edgeIds.length} selected
          </h2>
        }
        subtitle={parts.join(" · ")}
        onClose={onClose}
      />
      <div className="flex flex-wrap gap-2 px-5 pt-6">
        {components.length > 0 && (
          <Button onClick={duplicate}>
            <CopyIcon />
            Duplicate
          </Button>
        )}
        {components.length > 0 && (
          <Button
            onClick={() => simulation.toggleDown(components)}
            aria-keyshortcuts={shortcutKeys("takeDown")}
          >
            <PowerIcon />
            {allDown ? "Bring back" : "Take down"}
          </Button>
        )}
        <Button variant="danger" onClick={remove}>
          <TrashIcon />
          Delete
        </Button>
      </div>
    </>
  );
}
