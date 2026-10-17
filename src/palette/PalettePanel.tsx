import { MagnifyingGlassIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { type DragEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { shortcutKeys } from "../app/shortcuts.ts";
import { COMPONENT_DRAG_TYPE } from "../canvas/placement.ts";
import { useAddComponent } from "../canvas/useAddComponent.ts";
import { registry } from "../components/index.ts";
import type { Category, ComponentDefinition } from "../model/component.ts";
import { midSentence } from "../model/text.ts";
import { useUi } from "../store/index.ts";
import { IconButton } from "../ui/Button.tsx";
import { CollapsibleSection } from "../ui/Collapsible.tsx";
import { CATEGORY_LABEL, CATEGORY_TINT, componentIcon } from "../ui/componentIcons.tsx";
import { cx } from "../ui/cx.ts";
import { Kbd } from "../ui/Kbd.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { filterComponents } from "./filter.ts";

const panelTransition = "transition-[width] duration-(--duration-panel) ease-standard";

function startDrag(event: DragEvent, type: string) {
  event.dataTransfer.setData(COMPONENT_DRAG_TYPE, type);
  event.dataTransfer.effectAllowed = "copy";
}

/**
 * The component palette (UIUX §3): 264px with search and groups, or a 56px
 * icon rail when collapsed. Click adds to the middle of the canvas; drag
 * drops exactly where you let go.
 */
export function PalettePanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { addAtCentre } = useAddComponent();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<Category>>(new Set());
  const [focusSearch, setFocusSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => filterComponents(registry.list(), query), [query]);

  // `/` (see shortcuts.ts) opens the panel if needed, then asks for focus here.
  const searchRequest = useUi((s) => s.paletteSearchRequest);
  useEffect(() => {
    if (searchRequest > 0) setFocusSearch(true);
  }, [searchRequest]);

  useEffect(() => {
    if (focusSearch && open) {
      searchRef.current?.focus();
      setFocusSearch(false);
    }
  }, [focusSearch, open]);

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && results[0]) {
      addAtCentre(results[0].type);
    } else if (event.key === "Escape") {
      if (query) setQuery("");
      else event.currentTarget.blur();
    }
  };

  const setGroupOpen = (category: Category, isOpen: boolean) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <aside
      aria-label="Components"
      className={cx(
        "flex shrink-0 flex-col overflow-hidden border-r border-line bg-surface",
        panelTransition,
        open ? "w-66" : "w-14",
      )}
    >
      <div
        className={cx(
          "flex h-14 shrink-0 items-center",
          open ? "justify-between pr-3 pl-5" : "justify-center",
        )}
      >
        {open && <h2 className="text-sm font-medium text-fg-2">Components</h2>}
        <IconButton
          label={open ? "Collapse components panel" : "Expand components panel"}
          shortcut={shortcutKeys("togglePalette")}
          onClick={onToggle}
          aria-expanded={open}
        >
          <SidebarSimpleIcon />
        </IconButton>
      </div>

      {open ? (
        <>
          <div className="shrink-0 px-4 pb-4">
            <label className="flex h-8 items-center gap-2 rounded-control border border-line-strong bg-raised px-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
              <MagnifyingGlassIcon aria-hidden className="size-4 shrink-0 text-fg-3" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search components"
                aria-label="Search components"
                autoComplete="off"
                spellCheck={false}
                className="w-full min-w-0 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {!query && <Kbd>{shortcutKeys("searchComponents")}</Kbd>}
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
            {query ? (
              results.length > 0 ? (
                <ul aria-label="Search results">
                  {results.map((definition) => (
                    <li key={definition.type}>
                      <PaletteItem definition={definition} onAdd={addAtCentre} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 text-sm text-fg-2">No components match “{query.trim()}”.</p>
              )
            ) : (
              <div className="flex flex-col gap-4">
                {[...registry.byCategory()].map(([category, definitions]) =>
                  definitions.length === 0 ? null : (
                    <CollapsibleSection
                      key={category}
                      title={CATEGORY_LABEL[category]}
                      open={!collapsed.has(category)}
                      onOpenChange={(isOpen) => setGroupOpen(category, isOpen)}
                      className="[&>button]:px-2"
                    >
                      <ul>
                        {definitions.map((definition) => (
                          <li key={definition.type}>
                            <PaletteItem definition={definition} onAdd={addAtCentre} />
                          </li>
                        ))}
                      </ul>
                    </CollapsibleSection>
                  ),
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <ul
          aria-label="Components"
          className="flex flex-col items-center gap-1 overflow-y-auto pb-4"
        >
          {registry.list().map((definition) => (
            <li key={definition.type}>
              <RailItem definition={definition} onAdd={addAtCentre} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

type ItemProps = { definition: ComponentDefinition; onAdd: (type: string) => void };

function PaletteItem({ definition, onAdd }: ItemProps) {
  const Icon = componentIcon(definition.icon);
  return (
    <Tooltip content={definition.description} side="right">
      <button
        type="button"
        draggable
        onDragStart={(event) => startDrag(event, definition.type)}
        onClick={() => onAdd(definition.type)}
        className={cx(
          "flex h-8.5 w-full cursor-grab items-center gap-2.5 rounded-control px-2 text-left text-base text-fg",
          "transition-colors duration-(--duration-fast) hover:bg-fg/5 active:cursor-grabbing",
        )}
      >
        <Icon
          aria-hidden
          weight="duotone"
          className={cx("size-4.5 shrink-0", CATEGORY_TINT[definition.category])}
        />
        {definition.displayName}
      </button>
    </Tooltip>
  );
}

function RailItem({ definition, onAdd }: ItemProps) {
  const Icon = componentIcon(definition.icon);
  return (
    <Tooltip content={definition.displayName} side="right">
      <button
        type="button"
        draggable
        aria-label={`Add ${midSentence(definition.displayName)}`}
        onDragStart={(event) => startDrag(event, definition.type)}
        onClick={() => onAdd(definition.type)}
        className="grid size-9 cursor-grab place-items-center rounded-control transition-colors duration-(--duration-fast) hover:bg-fg/5"
      >
        <Icon
          aria-hidden
          weight="duotone"
          className={cx("size-4.5", CATEGORY_TINT[definition.category])}
        />
      </button>
    </Tooltip>
  );
}
