import {
  DotsThreeIcon,
  DownloadSimpleIcon,
  HandWavingIcon,
  ImageIcon,
  InfoIcon,
  KeyboardIcon,
  MoonIcon,
  SunIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { backUpAll, startRestore } from "../library/backup.ts";
import { LibraryPopover } from "../library/LibraryPopover.tsx";
import { uiStore, useUi } from "../store/index.ts";
import type { SaveStatus } from "../store/ui.ts";
import { Button, IconButton } from "../ui/Button.tsx";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "../ui/Dialog.tsx";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { useTheme } from "../ui/theme/ThemeProvider.tsx";
import { RunControls } from "./RunControls.tsx";
import { shortcutKeys } from "./shortcuts.ts";

/**
 * The 52px top bar (UIUX §3): system, run controls, theme and menu.
 */
export function TopBar() {
  return (
    <header className="grid h-13 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-surface pr-4 pl-5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-[0.9375rem] font-semibold tracking-tight">0n1</span>
        <span aria-hidden className="text-fg-3">
          /
        </span>
        <LibraryPopover />
        <SaveIndicator />
      </div>

      <RunControls />

      <div className="flex items-center justify-end gap-1">
        <ThemeToggle />
        <LabMenu />
      </div>
    </header>
  );
}

const SAVE_TEXT: Record<
  Exclude<SaveStatus, null>,
  { label: string; hint?: string; tone: string }
> = {
  saved: { label: "Saved", tone: "text-fg-3" },
  saving: { label: "Saving…", tone: "text-fg-3" },
  error: {
    label: "Couldn't save",
    hint: "Your latest changes aren't stored yet. 0n1 will try again on your next edit.",
    tone: "text-fail",
  },
  unavailable: {
    label: "Not saved",
    hint: "This browser isn't letting 0n1 store data, so changes will be lost when you close the tab.",
    tone: "text-warn",
  },
};

/** Faint autosave state next to the system name (UIUX §3). No spinners. */
function SaveIndicator() {
  const status = useUi((s) => s.saveStatus);
  if (!status) return null;
  const { label, hint, tone } = SAVE_TEXT[status];
  const indicator = (
    <span
      role="status"
      tabIndex={hint ? 0 : undefined}
      className={`ml-1 shrink-0 rounded-kbd text-xs ${tone}`}
    >
      {label}
    </span>
  );
  return hint ? <Tooltip content={hint}>{indicator}</Tooltip> : indicator;
}

function ThemeToggle() {
  const { resolved, setPreference } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <IconButton label={`Switch to ${next} theme`} onClick={() => setPreference(next)}>
      {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}

function LabMenu() {
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton label="Menu">
            <DotsThreeIcon weight="bold" />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon={<DownloadSimpleIcon />} onSelect={() => void backUpAll()}>
            Back up all systems
          </MenuItem>
          <MenuItem icon={<UploadSimpleIcon />} onSelect={() => void startRestore()}>
            Restore from backup…
          </MenuItem>
          <MenuItem icon={<ImageIcon />} disabled>
            Download image…
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={<KeyboardIcon />}
            shortcut={shortcutKeys("shortcuts")}
            onSelect={() => uiStore.getState().setShortcutsOpen(true)}
          >
            Keyboard shortcuts
          </MenuItem>
          <MenuItem
            icon={<HandWavingIcon />}
            onSelect={() => uiStore.getState().setWelcomeOpen(true)}
          >
            Welcome
          </MenuItem>
          <MenuItem icon={<InfoIcon />} onSelect={() => setAboutOpen(true)}>
            About 0n1
          </MenuItem>
        </MenuContent>
      </Menu>
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent title="0n1" description="Build it. Load it. Break it.">
          <div className="flex flex-col gap-3 text-base text-fg-2">
            <p>
              An open-source system design lab. Wire up components, push traffic through, and watch
              where the system breaks and why.
            </p>
            <p>Everything you build stays in this browser. Nothing is sent to a server.</p>
            <p className="text-sm text-fg-3">MIT licensed.</p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="primary">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
