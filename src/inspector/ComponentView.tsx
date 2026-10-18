import {
  ClipboardTextIcon,
  CopyIcon,
  DotsThreeIcon,
  PathIcon,
  PowerIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Fragment } from "react";
import { shortcutKeys } from "../app/shortcuts.ts";
import { copySelectionFromMenu } from "../canvas/useClipboard.ts";
import type { ShapeSettings } from "../components/client/shape.ts";
import { registry } from "../components/index.ts";
import { ComponentCostSection } from "../cost/CostViews.tsx";
import { InsightList } from "../insights/InsightViews.tsx";
import type { Params } from "../model/component.ts";
import { simulation, useLive } from "../simulation/index.ts";
import { designStore, selectionStore, useDesign } from "../store/index.ts";
import { IconButton } from "../ui/Button.tsx";
import { CollapsibleSection } from "../ui/Collapsible.tsx";
import { CATEGORY_LABEL, CATEGORY_TINT, componentIcon } from "../ui/componentIcons.tsx";
import { cx } from "../ui/cx.ts";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu.tsx";
import { EditableTitle } from "./EditableTitle.tsx";
import { InspectorHeader, InspectorSection } from "./InspectorHeader.tsx";
import { ComponentDetails, LiveSummary } from "./LiveSummary.tsx";
import { ParamField } from "./ParamField.tsx";
import { isParamShown, paramSections } from "./sections.ts";
import { TrafficShapePreview } from "./TrafficShapePreview.tsx";

/** The inspector for one selected component (UIUX §7). */
export function ComponentView({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const node = useDesign((s) => s.doc.nodes.find((n) => n.id === nodeId));
  const definition = node ? registry.get(node.type) : undefined;
  if (!node || !definition) return null;

  const Icon = componentIcon(definition.icon);
  const actions = designStore.getState();

  return (
    <>
      <InspectorHeader
        icon={
          <Icon
            aria-hidden
            weight="duotone"
            className={cx("size-5", CATEGORY_TINT[definition.category])}
          />
        }
        title={
          <EditableTitle
            label="Component name"
            value={node.name}
            onCommit={(name) => actions.renameNode(nodeId, name)}
          />
        }
        // The type when the name is custom ("Links DB · Database"), otherwise the category.
        subtitle={
          node.name === definition.displayName
            ? CATEGORY_LABEL[definition.category]
            : definition.displayName
        }
        actions={<ComponentMenu nodeId={nodeId} />}
        onClose={onClose}
      />
      <LiveSummary nodeId={nodeId} detail={definition.liveDetail ?? "p99"} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        <InsightList nodeId={nodeId} />
        <InspectorSection title="About">
          <div className="flex flex-col gap-2">
            <p className="text-base text-fg">{definition.description}</p>
            <CollapsibleSection title="How it's modelled" defaultOpen={false}>
              <p className="max-w-[65ch] text-sm leading-relaxed text-fg-2">
                {definition.modelNote}
              </p>
            </CollapsibleSection>
          </div>
        </InspectorSection>

        {paramSections(definition).map((group) => (
          <InspectorSection key={group.section} title={group.title}>
            {group.params
              .filter(([, spec]) => isParamShown(spec, node.params as Params))
              .map(([key, spec]) => (
                <Fragment key={key}>
                  <ParamField
                    spec={spec}
                    value={node.params[key] ?? spec.default}
                    params={node.params as Record<string, number | string | boolean>}
                    onChange={(value) => actions.updateParams(nodeId, { [key]: value })}
                  />
                  {node.type === "client" && key === "shape" && node.params.shape !== "steady" && (
                    <TrafficShapePreview settings={node.params as unknown as ShapeSettings} />
                  )}
                </Fragment>
              ))}
          </InspectorSection>
        ))}

        <ComponentCostSection nodeId={nodeId} />
        <ComponentDetails nodeId={nodeId} />
      </div>
    </>
  );
}

function ComponentMenu({ nodeId }: { nodeId: string }) {
  const duplicate = () => {
    const [copy] = designStore.getState().duplicateNodes([nodeId]);
    if (copy) selectionStore.getState().select({ nodeIds: [copy], edgeIds: [] });
  };
  const down = useLive((s) => s.nodes[nodeId]?.status === "down");
  const copy = () => {
    // The menu is about this component, whatever else is selected.
    selectionStore.getState().select({ nodeIds: [nodeId], edgeIds: [] });
    void copySelectionFromMenu();
  };
  const isClient = useDesign((s) => s.doc.nodes.find((n) => n.id === nodeId)?.type === "client");
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label="Component actions">
          <DotsThreeIcon weight="bold" />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<CopyIcon />} shortcut={shortcutKeys("duplicate")} onSelect={duplicate}>
          Duplicate
        </MenuItem>
        <MenuItem icon={<ClipboardTextIcon />} shortcut={shortcutKeys("copy")} onSelect={copy}>
          Copy
        </MenuItem>
        {isClient && (
          <MenuItem icon={<PathIcon />} onSelect={() => simulation.trace(nodeId)}>
            Trace a request
          </MenuItem>
        )}
        <MenuItem
          icon={<PowerIcon />}
          shortcut={shortcutKeys("takeDown")}
          onSelect={() => (down ? simulation.bringBack(nodeId) : simulation.takeDown(nodeId))}
        >
          {down ? "Bring back" : "Take down"}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={<TrashIcon />}
          tone="danger"
          shortcut={shortcutKeys("delete")}
          onSelect={() => designStore.getState().removeNodes([nodeId])}
        >
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
