import {
  ArrowCounterClockwiseIcon,
  BlueprintIcon,
  ClipboardIcon,
  ClipboardTextIcon,
  ClockCountdownIcon,
  CornersOutIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  HandWavingIcon,
  ImageIcon,
  KeyboardIcon,
  MagnifyingGlassPlusIcon,
  MoonIcon,
  NotePencilIcon,
  PathIcon,
  PlayIcon,
  PlusIcon,
  SkipForwardIcon,
  SunIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { BLUEPRINTS } from "../blueprints/catalog.ts";
import { useAddComponent } from "../canvas/useAddComponent.ts";
import { useAddNote } from "../canvas/useAddNote.ts";
import { copySelectionFromMenu, usePaste } from "../canvas/useClipboard.ts";
import { useViewActions } from "../canvas/useViewActions.ts";
import { registry } from "../components/index.ts";
import { backUpAll, startRestore } from "../library/backup.ts";
import { library } from "../library/index.ts";
import { useSystemsList } from "../library/useSystemsList.ts";
import { midSentence } from "../model/text.ts";
import { simulation } from "../simulation/index.ts";
import { useSimulation } from "../simulation/store.ts";
import { isStorageAvailable } from "../storage/index.ts";
import { uiStore, useDesign, useSelection, useUi } from "../store/index.ts";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/Command.tsx";
import { CATEGORY_TINT, componentIcon } from "../ui/componentIcons.tsx";
import { cx } from "../ui/cx.ts";
import { useTheme } from "../ui/theme/ThemeProvider.tsx";
import { shortcutKeys } from "./shortcuts.ts";

/**
 * ⌘K / Ctrl+K (see shortcuts.ts): every action by name (UIUX §11). Later
 * steps add their commands here (systems, run controls, backup…).
 */
export function CommandPalette() {
  const open = useUi((s) => s.commandPaletteOpen);
  const setOpen = (next: boolean) => uiStore.getState().setCommandPaletteOpen(next);
  const { addAtCentre } = useAddComponent();
  const view = useViewActions();
  const { resolved, setPreference } = useTheme();
  const { pasteFromMenu } = usePaste();
  const { addNoteAtCentre } = useAddNote();
  const selected = useSelection((s) => s.nodeIds.length);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const nextTheme = resolved === "dark" ? "light" : "dark";
  const running = useSimulation((s) => s.running);
  const timelineOpen = useUi((s) => s.timelineOpen);

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cx(
            "fixed top-[18vh] left-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden",
            "rounded-card border border-line bg-raised shadow-raised focus-visible:outline-none",
            "data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
          )}
        >
          <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
          <Command label="Commands">
            <CommandInput placeholder="Type a command or search…" />
            <CommandList className="max-h-96">
              <CommandEmpty>Nothing matches.</CommandEmpty>
              <CommandGroup heading="Simulation">
                <CommandItem
                  value={running ? "Pause the run" : "Run the system"}
                  keywords={["start", "play", "simulate", "stop"]}
                  shortcut={shortcutKeys("runPause")}
                  onSelect={run(simulation.toggle)}
                  icon={<PlayIcon aria-hidden className="text-fg-2" />}
                >
                  {running ? "Pause the run" : "Run the system"}
                </CommandItem>
                <CommandItem
                  value="Step 1 second"
                  shortcut={shortcutKeys("step")}
                  onSelect={run(simulation.step)}
                  icon={<SkipForwardIcon aria-hidden className="text-fg-2" />}
                >
                  Step 1 second
                </CommandItem>
                <CommandItem
                  value="Reset the run"
                  keywords={["restart"]}
                  shortcut={shortcutKeys("reset")}
                  onSelect={run(simulation.reset)}
                  icon={<ArrowCounterClockwiseIcon aria-hidden className="text-fg-2" />}
                >
                  Reset the run
                </CommandItem>
                <CommandItem
                  value="Trace a request"
                  keywords={["follow", "path", "hops", "waterfall", "latency"]}
                  onSelect={run(() => simulation.trace())}
                  icon={<PathIcon aria-hidden className="text-fg-2" />}
                >
                  Trace a request
                </CommandItem>
                <CommandItem
                  value={timelineOpen ? "Hide the chaos timeline" : "Show the chaos timeline"}
                  keywords={["chaos", "failure", "schedule", "events", "scenario", "timeline"]}
                  shortcut={shortcutKeys("timeline")}
                  onSelect={run(() => uiStore.getState().setTimelineOpen(!timelineOpen))}
                  icon={<ClockCountdownIcon aria-hidden className="text-fg-2" />}
                >
                  {timelineOpen ? "Hide the chaos timeline" : "Show the chaos timeline"}
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Add component">
                {registry.list().map((definition) => {
                  const Icon = componentIcon(definition.icon);
                  return (
                    <CommandItem
                      key={definition.type}
                      value={`add ${definition.displayName}`}
                      keywords={[...(definition.keywords ?? [])]}
                      onSelect={run(() => addAtCentre(definition.type))}
                      icon={
                        <Icon
                          aria-hidden
                          weight="duotone"
                          className={CATEGORY_TINT[definition.category]}
                        />
                      }
                    >
                      Add {midSentence(definition.displayName)}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {isStorageAvailable() && (
                <SystemsCommands
                  run={run}
                  onBrowse={() => uiStore.getState().setLibraryOpen(true)}
                />
              )}
              <CommandGroup heading="Edit">
                <CommandItem
                  value="Add a note"
                  keywords={["sticky", "annotation", "comment", "text"]}
                  shortcut={shortcutKeys("addNote")}
                  onSelect={run(() => void addNoteAtCentre())}
                  icon={<NotePencilIcon aria-hidden className="text-fg-2" />}
                >
                  Add a note
                </CommandItem>
                {selected > 0 && (
                  <CommandItem
                    value="Copy selected components"
                    keywords={["clipboard"]}
                    shortcut={shortcutKeys("copy")}
                    onSelect={run(() => void copySelectionFromMenu())}
                    icon={<ClipboardTextIcon aria-hidden className="text-fg-2" />}
                  >
                    Copy selected components
                  </CommandItem>
                )}
                <CommandItem
                  value="Paste components"
                  keywords={["clipboard"]}
                  shortcut={shortcutKeys("paste")}
                  onSelect={run(() => void pasteFromMenu())}
                  icon={<ClipboardIcon aria-hidden className="text-fg-2" />}
                >
                  Paste components
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="View">
                <CommandItem
                  value="Fit to view"
                  shortcut={shortcutKeys("fitView")}
                  onSelect={run(view.fitView)}
                  icon={<CornersOutIcon aria-hidden className="text-fg-2" />}
                >
                  Fit to view
                </CommandItem>
                <CommandItem
                  value="Zoom to 100%"
                  shortcut={shortcutKeys("zoomToActual")}
                  onSelect={run(view.zoomToActual)}
                  icon={<MagnifyingGlassPlusIcon aria-hidden className="text-fg-2" />}
                >
                  Zoom to 100%
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Help">
                <CommandItem
                  value="Keyboard shortcuts"
                  keywords={["keys", "hotkeys", "help"]}
                  shortcut={shortcutKeys("shortcuts")}
                  onSelect={run(() => uiStore.getState().setShortcutsOpen(true))}
                  icon={<KeyboardIcon aria-hidden className="text-fg-2" />}
                >
                  Keyboard shortcuts
                </CommandItem>
                <CommandItem
                  value="Welcome"
                  keywords={["start", "blueprints", "intro", "tips"]}
                  onSelect={run(() => uiStore.getState().setWelcomeOpen(true))}
                  icon={<HandWavingIcon aria-hidden className="text-fg-2" />}
                >
                  Welcome
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Appearance">
                <CommandItem
                  value={`Switch to ${nextTheme} theme`}
                  keywords={["theme", "mode", "appearance"]}
                  onSelect={run(() => setPreference(nextTheme))}
                  icon={
                    nextTheme === "dark" ? (
                      <MoonIcon aria-hidden className="text-fg-2" />
                    ) : (
                      <SunIcon aria-hidden className="text-fg-2" />
                    )
                  }
                >
                  Switch to {nextTheme} theme
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

type SystemsCommandsProps = {
  run: (action: () => void) => () => void;
  onBrowse: () => void;
};

/** New (blank or from a blueprint), browse, and open each other saved system by name. */
function SystemsCommands({ run, onBrowse }: SystemsCommandsProps) {
  const saved = useSystemsList();
  const openId = useDesign((s) => s.doc.id);
  return (
    <CommandGroup heading="Systems">
      <CommandItem
        value="New system"
        keywords={["create", "blank"]}
        onSelect={run(() => void library.createAndOpen())}
        icon={<PlusIcon aria-hidden className="text-fg-2" />}
      >
        New system
      </CommandItem>
      {BLUEPRINTS.map((blueprint) => (
        <CommandItem
          key={blueprint.id}
          value={`New system from blueprint: ${blueprint.title}`}
          keywords={["blueprint", "example", "template"]}
          onSelect={run(() => void library.createFromBlueprint(blueprint))}
          icon={<BlueprintIcon aria-hidden className="text-fg-2" />}
        >
          New system from blueprint: {blueprint.title}
        </CommandItem>
      ))}
      <CommandItem
        value="Back up all systems"
        keywords={["export", "download", "save", "json"]}
        onSelect={run(() => void backUpAll())}
        icon={<DownloadSimpleIcon aria-hidden className="text-fg-2" />}
      >
        Back up all systems
      </CommandItem>
      <CommandItem
        value="Restore from backup"
        keywords={["import", "upload", "open file", "json"]}
        onSelect={run(() => void startRestore())}
        icon={<UploadSimpleIcon aria-hidden className="text-fg-2" />}
      >
        Restore from backup…
      </CommandItem>
      <CommandItem
        value="Download image"
        keywords={["export", "png", "svg", "picture", "screenshot"]}
        onSelect={run(() => uiStore.getState().setImageExportOpen(true))}
        icon={<ImageIcon aria-hidden className="text-fg-2" />}
      >
        Download image
      </CommandItem>
      <CommandItem
        value="Browse systems"
        keywords={["library", "switch"]}
        onSelect={run(onBrowse)}
        icon={<FolderOpenIcon aria-hidden className="text-fg-2" />}
      >
        Browse systems…
      </CommandItem>
      {(saved ?? [])
        .filter((s) => s.id !== openId)
        .map((system) => (
          <CommandItem
            key={system.id}
            value={`Open ${system.name} ${system.id}`}
            keywords={["switch"]}
            onSelect={run(() => void library.open(system.id))}
            icon={<FolderOpenIcon aria-hidden className="text-fg-2" />}
          >
            Open “{system.name}”
          </CommandItem>
        ))}
    </CommandGroup>
  );
}
