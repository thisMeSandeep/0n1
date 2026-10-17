import {
  CaretDownIcon,
  CopyIcon,
  DotsThreeIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type KeyboardEvent, useMemo, useState } from "react";
import { isStorageAvailable } from "../storage/index.ts";
import type { SystemSummary } from "../storage/systems.ts";
import { uiStore, useDesign, useUi } from "../store/index.ts";
import { Button, IconButton } from "../ui/Button.tsx";
import { cx } from "../ui/cx.ts";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.tsx";
import { toast } from "../ui/Toast.tsx";
import { library } from "./index.ts";
import { formatEdited } from "./time.ts";
import { useSystemsList } from "./useSystemsList.ts";

const setOpen = (open: boolean) => uiStore.getState().setLibraryOpen(open);

/** Report a failed library action without losing the user's place. */
async function attempt(action: () => Promise<unknown>, failure: string) {
  try {
    await action();
  } catch (error) {
    console.error(`0n1: ${failure}`, error);
    toast({ title: failure });
  }
}

/** The system name in the top bar, opening the systems library (UIUX §10). */
export function LibraryPopover() {
  const open = useUi((s) => s.libraryOpen);
  const name = useDesign((s) => s.doc.name);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${name}, open systems library`}
          className="flex h-7 min-w-0 items-center gap-1 rounded-control px-1.5 font-medium transition-colors duration-(--duration-fast) hover:bg-fg/6"
        >
          <span className="truncate">{name}</span>
          <CaretDownIcon aria-hidden className="size-3 shrink-0 text-fg-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-95 overflow-hidden p-0!" align="start">
        <LibraryPanel />
      </PopoverContent>
    </Popover>
  );
}

function LibraryPanel() {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const saved = useSystemsList();
  const openId = useDesign((s) => s.doc.id);
  const openName = useDesign((s) => s.doc.name);
  const openUpdated = useDesign((s) => s.doc.meta.updatedAt);

  // The open system may have edits that aren't saved yet; show its live name and time.
  const rows = useMemo(() => {
    const list = (saved ?? []).map((s) =>
      s.id === openId ? { ...s, name: openName, updatedAt: openUpdated } : s,
    );
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return list
      .filter((s) => terms.every((t) => s.name.toLowerCase().includes(t)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [saved, openId, openName, openUpdated, query]);

  if (!isStorageAvailable()) {
    return (
      <p className="p-4 text-sm text-fg-2">
        This browser isn't letting 0n1 store data, so there's no library. Your current system works
        until you close the tab.
      </p>
    );
  }

  const remove = (system: SystemSummary) =>
    attempt(async () => {
      const deleted = await library.remove(system.id);
      if (!deleted) return;
      toast({
        title: `Deleted “${system.name}”`,
        durationMs: 8000,
        action: {
          label: "Undo",
          onClick: () => void attempt(deleted.restore, "Couldn't restore that system"),
        },
      });
    }, "Couldn't delete that system");

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-line p-3">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-control border border-line-strong bg-raised px-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <MagnifyingGlassIcon aria-hidden className="size-4 shrink-0 text-fg-3" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search systems"
            aria-label="Search systems"
            className="w-full min-w-0 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none"
          />
        </label>
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            void attempt(async () => {
              await library.createAndOpen();
              setOpen(false);
            }, "Couldn't create a system")
          }
        >
          <PlusIcon />
          New system
        </Button>
      </div>

      <ul aria-label="Systems" className="max-h-80 overflow-y-auto p-1.5">
        {saved === undefined ? null : rows.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-fg-2">
            No systems match “{query.trim()}”.
          </li>
        ) : (
          rows.map((system) => (
            <li key={system.id}>
              <SystemRow
                system={system}
                isOpen={system.id === openId}
                renaming={renaming === system.id}
                onOpen={() =>
                  void attempt(async () => {
                    await library.open(system.id);
                    setOpen(false);
                  }, "Couldn't open that system")
                }
                onRename={() => setRenaming(system.id)}
                onRenameDone={(name) => {
                  setRenaming(null);
                  if (name !== null)
                    void attempt(
                      () => library.rename(system.id, name),
                      "Couldn't rename that system",
                    );
                }}
                onDuplicate={() =>
                  void attempt(() => library.duplicate(system.id), "Couldn't duplicate that system")
                }
                onDelete={() => void remove(system)}
              />
            </li>
          ))
        )}
      </ul>

      <p className="border-t border-line px-4 py-3 text-xs text-fg-2">
        Your systems live only in this browser.
      </p>
    </div>
  );
}

type SystemRowProps = {
  system: SystemSummary;
  isOpen: boolean;
  renaming: boolean;
  onOpen: () => void;
  onRename: () => void;
  /** The new name, or null when cancelled. */
  onRenameDone: (name: string | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

function SystemRow({
  system,
  isOpen,
  renaming,
  onOpen,
  onRename,
  onRenameDone,
  onDuplicate,
  onDelete,
}: SystemRowProps) {
  const subtitle = `Edited ${formatEdited(system.updatedAt)}`;

  if (renaming) {
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") onRenameDone(event.currentTarget.value);
      else if (event.key === "Escape") {
        event.stopPropagation(); // keep the popover open
        onRenameDone(null);
      }
    };
    return (
      <div className="px-2 py-1.5">
        <input
          // biome-ignore lint/a11y/noAutofocus: the user just chose "Rename"
          autoFocus
          aria-label="System name"
          defaultValue={system.name}
          maxLength={80}
          onKeyDown={onKeyDown}
          onBlur={(event) => onRenameDone(event.currentTarget.value)}
          onFocus={(event) => event.currentTarget.select()}
          className="h-8 w-full rounded-control border border-line-strong bg-raised px-2 text-base text-fg outline-none focus:outline-2 focus:outline-offset-2 focus:outline-accent"
        />
      </div>
    );
  }

  return (
    <div
      className={cx(
        "group flex items-center gap-1 rounded-control transition-colors duration-(--duration-fast)",
        isOpen ? "bg-accent-soft" : "hover:bg-fg/5",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={isOpen ? "true" : undefined}
        className="flex min-w-0 flex-1 flex-col items-start rounded-control px-2.5 py-2 text-left"
      >
        <span
          className={cx(
            "w-full truncate text-base",
            isOpen ? "font-medium text-accent" : "text-fg",
          )}
        >
          {system.name}
        </span>
        <span className="text-xs text-fg-2">{isOpen ? `Open · ${subtitle}` : subtitle}</span>
      </button>
      <Menu>
        <MenuTrigger asChild>
          <IconButton
            label={`Actions for ${system.name}`}
            size="sm"
            tooltip={false}
            className="mr-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <DotsThreeIcon weight="bold" />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon={<PencilSimpleIcon />} onSelect={onRename}>
            Rename
          </MenuItem>
          <MenuItem icon={<CopyIcon />} onSelect={onDuplicate}>
            Duplicate
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<TrashIcon />} tone="danger" onSelect={onDelete}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}
