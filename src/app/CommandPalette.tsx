import {
  CornersOutIcon,
  KeyboardIcon,
  MagnifyingGlassPlusIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useAddComponent } from "../canvas/useAddComponent.ts";
import { useViewActions } from "../canvas/useViewActions.ts";
import { registry } from "../components/index.ts";
import { midSentence } from "../model/text.ts";
import { uiStore, useUi } from "../store/index.ts";
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

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const nextTheme = resolved === "dark" ? "light" : "dark";

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
