import { CornersOutIcon, MagnifyingGlassPlusIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { useAddComponent } from "../canvas/useAddComponent.ts";
import { useViewActions } from "../canvas/useViewActions.ts";
import { registry } from "../components/index.ts";
import { midSentence } from "../model/text.ts";
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

/**
 * ⌘K / Ctrl+K: every action by name (UIUX §11). Later steps add their
 * commands here (systems, run controls, backup…).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { addAtCentre } = useAddComponent();
  const view = useViewActions();
  const { resolved, setPreference } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
                  shortcut="F"
                  onSelect={run(view.fitView)}
                  icon={<CornersOutIcon aria-hidden className="text-fg-2" />}
                >
                  Fit to view
                </CommandItem>
                <CommandItem
                  value="Zoom to 100%"
                  shortcut="1"
                  onSelect={run(view.zoomToActual)}
                  icon={<MagnifyingGlassPlusIcon aria-hidden className="text-fg-2" />}
                >
                  Zoom to 100%
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
