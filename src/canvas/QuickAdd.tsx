import { useMemo, useState } from "react";
import { registry } from "../components/index.ts";
import { canConnect } from "../model/component.ts";
import type { Position } from "../model/document.ts";
import { filterComponents } from "../palette/filter.ts";
import { designStore, selectionStore } from "../store/index.ts";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "../ui/Command.tsx";
import { CATEGORY_TINT, componentIcon } from "../ui/componentIcons.tsx";
import { cx } from "../ui/cx.ts";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/Popover.tsx";
import { centredAt, leftEdgeAt } from "./placement.ts";

export type QuickAddRequest = {
  /** Where to show the search (screen coordinates). */
  screen: Position;
  /** Where to put the component (canvas coordinates). */
  flow: Position;
  /** Set when a connection was dragged into empty space: connect from this node. */
  fromNodeId: string | null;
};

/** Valid next components for a connection from `fromType`, or everything. */
export function quickAddCandidates(fromType: string | null) {
  const from = fromType ? registry.get(fromType) : undefined;
  return from ? registry.list().filter((d) => canConnect(from, d).ok) : registry.list();
}

/**
 * A search at the cursor for adding a component right there (UIUX §6,
 * Adding things). From a dangling connection it only offers valid targets
 * and connects the new component.
 */
export function QuickAdd({ request, onClose }: { request: QuickAddRequest; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const fromNode = request.fromNodeId
    ? designStore.getState().doc.nodes.find((n) => n.id === request.fromNodeId)
    : undefined;
  const results = useMemo(
    () => filterComponents(quickAddCandidates(fromNode?.type ?? null), query),
    [fromNode?.type, query],
  );

  const pick = (type: string) => {
    const store = designStore.getState();
    // Adding and connecting is one undo step.
    store.beginGesture();
    const id = store.addNode(type, fromNode ? leftEdgeAt(request.flow) : centredAt(request.flow));
    if (fromNode) store.connect(fromNode.id, id);
    store.endGesture();
    selectionStore.getState().select({ nodeIds: [id], edgeIds: [] });
    onClose();
  };

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: request.screen.x, top: request.screen.y }}
        />
      </PopoverAnchor>
      <PopoverContent className="w-72 overflow-hidden p-0!" sideOffset={4}>
        <Command
          shouldFilter={false}
          label={fromNode ? `Connect ${fromNode.name} to` : "Add a component"}
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={fromNode ? `Connect ${fromNode.name} to…` : "Add a component…"}
          />
          <CommandList>
            <CommandEmpty>No components match.</CommandEmpty>
            {results.map((definition) => {
              const Icon = componentIcon(definition.icon);
              return (
                <CommandItem
                  key={definition.type}
                  value={definition.type}
                  onSelect={() => pick(definition.type)}
                  icon={
                    <Icon
                      aria-hidden
                      weight="duotone"
                      className={cx(CATEGORY_TINT[definition.category])}
                    />
                  }
                >
                  {definition.displayName}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
