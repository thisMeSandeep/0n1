import {
  ClipboardTextIcon,
  CopyIcon,
  PathIcon,
  PowerIcon,
  ScissorsIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { shortcutKeys } from "../app/shortcuts.ts";
import { simulation, useLive } from "../simulation/index.ts";
import { designStore, selectionStore, useDesign } from "../store/index.ts";
import { MenuItem, MenuLabel, MenuSeparator } from "../ui/Menu.tsx";
import { copySelectionFromMenu, cutSelectionFromMenu } from "./useClipboard.ts";

/*
 * What can be done to components, as menu items: one list for a
 * component's ⋯ menu in the inspector and the canvas's right-click menu, so
 * they can't drift apart. Each acts on the components it's given.
 */

export function ComponentActionItems({ nodeIds }: { nodeIds: readonly string[] }) {
  const nodes = useDesign((s) => s.doc.nodes);
  const allDown = useLive(
    (s) => nodeIds.length > 0 && nodeIds.every((id) => s.nodes[id]?.status === "down"),
  );
  const onlyClient =
    nodeIds.length === 1 && nodes.find((n) => n.id === nodeIds[0])?.type === "client";

  const duplicate = () => {
    const copies = designStore.getState().duplicateNodes(nodeIds);
    selectionStore.getState().select({ nodeIds: copies, edgeIds: [] });
  };
  const remove = () => designStore.getState().removeNodes(nodeIds);

  return (
    <>
      {nodeIds.length > 1 && <MenuLabel>{nodeIds.length} components</MenuLabel>}
      <MenuItem icon={<CopyIcon />} shortcut={shortcutKeys("duplicate")} onSelect={duplicate}>
        Duplicate
      </MenuItem>
      <MenuItem
        icon={<ClipboardTextIcon />}
        shortcut={shortcutKeys("copy")}
        onSelect={() => void copySelectionFromMenu(nodeIds)}
      >
        Copy
      </MenuItem>
      <MenuItem
        icon={<ScissorsIcon />}
        shortcut={shortcutKeys("cut")}
        onSelect={() => void cutSelectionFromMenu(nodeIds)}
      >
        Cut
      </MenuItem>
      {onlyClient && (
        <MenuItem icon={<PathIcon />} onSelect={() => simulation.trace(nodeIds[0] ?? null)}>
          Trace a request
        </MenuItem>
      )}
      <MenuItem
        icon={<PowerIcon />}
        shortcut={shortcutKeys("takeDown")}
        onSelect={() => simulation.toggleDown(nodeIds)}
      >
        {allDown ? "Bring back" : "Take down"}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<TrashIcon />}
        tone="danger"
        shortcut={shortcutKeys("delete")}
        onSelect={remove}
      >
        Delete
      </MenuItem>
    </>
  );
}
