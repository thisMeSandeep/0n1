import {
  CopyIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  SkipForwardIcon,
  SunIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { Button, IconButton } from "../Button.tsx";
import { CollapsibleSection } from "../Collapsible.tsx";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "../Dialog.tsx";
import { Kbd } from "../Kbd.tsx";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../Menu.tsx";
import { NumberField } from "../NumberField.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover.tsx";
import { SliderField } from "../SliderField.tsx";
import { toast } from "../Toast.tsx";
import { Tooltip } from "../Tooltip.tsx";
import { useTheme } from "../theme/ThemeProvider.tsx";

/** Dev-only page (`?gallery`) showing every primitive. Not part of production builds. */
export default function Gallery() {
  const { resolved, setPreference } = useTheme();
  const [running, setRunning] = useState(false);
  const [connections, setConnections] = useState(50);
  const [queryTime, setQueryTime] = useState(12);
  const [hitRatio, setHitRatio] = useState(0.45);

  return (
    <div className="min-h-dvh bg-canvas px-12 py-10 text-fg">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">UI primitives</h1>
          <p className="text-base text-fg-2">Dev-only gallery. Everything here uses tokens only.</p>
        </div>
        <IconButton
          label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => setPreference(resolved === "dark" ? "light" : "dark")}
        >
          {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
        </IconButton>
      </header>

      <div className="grid grid-cols-2 gap-6">
        <Section title="Buttons">
          <Row>
            <Button variant="primary" onClick={() => setRunning(!running)}>
              {running ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
              {running ? "Running" : "Run"}
            </Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button disabled>Disabled</Button>
          </Row>
          <Row>
            <Button variant="primary" size="sm">
              Small primary
            </Button>
            <Button size="sm">Small</Button>
            <IconButton label="Step" shortcut=".">
              <SkipForwardIcon />
            </IconButton>
            <IconButton label="More" size="sm">
              <DotsThreeIcon />
            </IconButton>
          </Row>
        </Section>

        <Section title="Tooltip & Kbd">
          <Row>
            <Tooltip content="Add a component" shortcut="⌘K">
              <Button>Hover me</Button>
            </Tooltip>
            <span className="text-base text-fg-2">
              Search <Kbd>/</Kbd> · Run <Kbd>Space</Kbd> · Undo <Kbd>⌘Z</Kbd>
            </span>
          </Row>
        </Section>

        <Section title="Popover & menu">
          <Row>
            <Popover>
              <PopoverTrigger asChild>
                <Button>URL shortener</Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <p className="text-md font-semibold">Systems</p>
                <p className="mt-1 text-sm text-fg-2">
                  Your systems live only in this browser. Back up now and then.
                </p>
              </PopoverContent>
            </Popover>
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="Component menu">
                  <DotsThreeIcon />
                </IconButton>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<CopyIcon />} shortcut="⌘D">
                  Duplicate
                </MenuItem>
                <MenuItem icon={<PowerIcon />} shortcut="K">
                  Take down
                </MenuItem>
                <MenuItem icon={<DownloadSimpleIcon />} disabled>
                  Back up this system
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<TrashIcon />} tone="danger" shortcut="⌫">
                  Delete
                </MenuItem>
              </MenuContent>
            </Menu>
          </Row>
        </Section>

        <Section title="Dialog & toast">
          <Row>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Restore from backup…</Button>
              </DialogTrigger>
              <DialogContent
                title="Restore 4 systems?"
                description="They'll be added alongside your existing ones. Nothing is overwritten."
              >
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="primary">Restore systems</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button onClick={() => toast({ title: "Backup saved" })}>Toast</Button>
            <Button
              onClick={() =>
                toast({
                  title: "Deleted “URL shortener”",
                  durationMs: 8000,
                  action: { label: "Undo", onClick: () => toast({ title: "Restored" }) },
                })
              }
            >
              Toast with undo
            </Button>
          </Row>
        </Section>

        <Section title="Slider fields">
          <div className="flex w-80 flex-col gap-5">
            <SliderField
              label="Connections"
              value={connections}
              onChange={setConnections}
              min={1}
              max={1000}
              step={1}
              scale="log"
              defaultValue={50}
            />
            <SliderField
              label="Query time"
              value={queryTime}
              onChange={setQueryTime}
              min={0.1}
              max={10_000}
              scale="log"
              unit="ms"
              defaultValue={12}
            />
            <SliderField
              label="Hit ratio"
              value={hitRatio}
              onChange={setHitRatio}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.45}
            />
          </div>
        </Section>

        <Section title="Number field & collapsible">
          <div className="flex w-80 flex-col gap-4">
            <NumberField
              aria-label="Timeout"
              value={queryTime}
              onChange={setQueryTime}
              min={0.1}
              max={10_000}
              scale="log"
              unit="ms"
              className="self-start"
            />
            <CollapsibleSection title="Details" defaultOpen={false}>
              <dl className="grid grid-cols-2 gap-y-2 text-base">
                <dt className="text-fg-2">Waiting in line</dt>
                <dd className="text-right">142</dd>
                <dt className="text-fg-2">p99</dt>
                <dd className="text-right">
                  1.42 <span className="text-sm text-fg-2">s</span>
                </dd>
              </dl>
            </CollapsibleSection>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="mb-4 text-sm font-medium text-fg-2">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
