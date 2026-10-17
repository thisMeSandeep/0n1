import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  ImageIcon,
  InfoIcon,
  KeyboardIcon,
  MoonIcon,
  PlayIcon,
  SkipForwardIcon,
  SunIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useDesign } from "../store/index.ts";
import { Button, IconButton } from "../ui/Button.tsx";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "../ui/Dialog.tsx";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu.tsx";
import { useTheme } from "../ui/theme/ThemeProvider.tsx";

/**
 * The 52px top bar (UIUX §3). Run controls and most menu items are
 * placeholders until the steps that wire them up.
 */
export function TopBar() {
  const systemName = useDesign((s) => s.doc.name);
  return (
    <header className="grid h-13 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-surface pr-4 pl-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-[0.9375rem] font-semibold tracking-tight">0n1</span>
        <span aria-hidden className="text-fg-3">
          /
        </span>
        <span className="truncate font-medium">{systemName}</span>
      </div>

      <RunControls />

      <div className="flex items-center justify-end gap-1">
        <ThemeToggle />
        <LabMenu />
      </div>
    </header>
  );
}

function RunControls() {
  return (
    <fieldset className="m-0 flex min-w-0 items-center gap-1 border-0 p-0">
      <legend className="sr-only">Simulation</legend>
      <Button variant="primary" disabled>
        <PlayIcon weight="fill" />
        Run
      </Button>
      <IconButton label="Step" disabled>
        <SkipForwardIcon />
      </IconButton>
      <IconButton label="Reset" disabled>
        <ArrowCounterClockwiseIcon />
      </IconButton>
      <span className="mx-1.5 text-sm text-fg-3">
        <span className="sr-only">Simulation time </span>
        00:00
      </span>
      <span aria-hidden className="mx-2 h-5 w-px bg-line" />
      <Button variant="ghost" size="md" disabled>
        Speed <span className="font-medium">1×</span>
        <CaretDownIcon className="size-3!" />
      </Button>
      <Button variant="ghost" size="md" disabled>
        Traffic <span className="font-medium">100%</span>
        <CaretDownIcon className="size-3!" />
      </Button>
    </fieldset>
  );
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
          <MenuItem icon={<DownloadSimpleIcon />} disabled>
            Back up all systems…
          </MenuItem>
          <MenuItem icon={<UploadSimpleIcon />} disabled>
            Restore from backup…
          </MenuItem>
          <MenuItem icon={<ImageIcon />} disabled>
            Download image…
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<KeyboardIcon />} shortcut="?" disabled>
            Keyboard shortcuts
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
