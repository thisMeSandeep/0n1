import { CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { designStore, selectionStore } from "../store/index.ts";
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
  const parts = [
    nodeIds.length > 0 && count(nodeIds.length, "component"),
    edgeIds.length > 0 && count(edgeIds.length, "connection"),
  ].filter(Boolean);

  const duplicate = () => {
    const copies = designStore.getState().duplicateNodes(nodeIds);
    selectionStore.getState().select({ nodeIds: copies, edgeIds: [] });
  };
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
        {nodeIds.length > 0 && (
          <Button onClick={duplicate}>
            <CopyIcon />
            Duplicate
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
