import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  ClockCountdownIcon,
  PauseIcon,
  PlayIcon,
  SkipForwardIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { registry } from "../components/index.ts";
import { compile } from "../engine/compile.ts";
import { SPEEDS } from "../engine/worker/protocol.ts";
import { TRAFFIC_LEVELS } from "../simulation/controller.ts";
import { formatClock, formatSpeed, formatTraffic } from "../simulation/format.ts";
import { simulation } from "../simulation/index.ts";
import { useSimulation } from "../simulation/store.ts";
import { selectionStore, uiStore, useDesign, useUi } from "../store/index.ts";
import { Button, IconButton } from "../ui/Button.tsx";
import { cx } from "../ui/cx.ts";
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/Menu.tsx";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/Popover.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { shortcutKeys } from "./shortcuts.ts";

/** Run, step, reset, the clock, speed and traffic (UIUX §3, §10 Running). */
export function RunControls() {
  const running = useSimulation((s) => s.running);
  const time = useSimulation((s) => s.snapshot?.time ?? 0);
  const started = useSimulation((s) => s.snapshot !== null);
  const weight = useSimulation((s) => s.snapshot?.sampling.weight ?? 1);
  const speed = useSimulation((s) => s.speed);
  const traffic = useSimulation((s) => s.traffic);
  const runAttempted = useSimulation((s) => s.runAttempted);

  return (
    <fieldset className="m-0 flex min-w-0 items-center gap-1 border-0 p-0">
      <legend className="sr-only">Simulation</legend>
      <Problems open={runAttempted && !running}>
        <Tooltip content={running ? "Pause" : "Run"} shortcut={shortcutKeys("runPause")}>
          <Button
            variant="primary"
            data-run-button
            onClick={simulation.toggle}
            aria-keyshortcuts="Space"
            // Same width as Run or Pause, so the bar doesn't shift.
            className={`min-w-[5.75rem] ${running ? "bg-accent/18" : ""}`}
          >
            {running ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
            {running ? "Pause" : "Run"}
          </Button>
        </Tooltip>
      </Problems>
      <IconButton label="Step 1 second" shortcut={shortcutKeys("step")} onClick={simulation.step}>
        <SkipForwardIcon />
      </IconButton>
      <IconButton
        label="Reset"
        shortcut={shortcutKeys("reset")}
        onClick={simulation.reset}
        disabled={!started}
      >
        <ArrowCounterClockwiseIcon />
      </IconButton>
      <span
        role="timer"
        aria-label="Simulation time"
        className={`mx-1.5 text-sm ${started ? "text-fg-2" : "text-fg-3"}`}
      >
        {formatClock(time)}
      </span>
      {weight > 1 && (
        <Tooltip
          content={`To keep your browser responsive, each simulated request stands for ${weight} real ones. Numbers are estimates.`}
        >
          <button type="button" className="cursor-default rounded-kbd text-xs text-fg-3">
            Sampling 1 in {weight}
          </button>
        </Tooltip>
      )}
      <span aria-hidden className="mx-2 h-5 w-px bg-line" />
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" aria-label={`Speed ${formatSpeed(speed)}`}>
            Speed <span className="font-medium text-fg">{formatSpeed(speed)}</span>
            <CaretDownIcon className="size-3!" />
          </Button>
        </MenuTrigger>
        <MenuContent align="center" className="min-w-36">
          <MenuLabel>Speed</MenuLabel>
          <MenuRadioGroup
            value={String(speed)}
            onValueChange={(value) => simulation.setSpeed(Number(value))}
          >
            {SPEEDS.map((s) => (
              <MenuRadioItem key={s} value={String(s)}>
                {formatSpeed(s)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" aria-label={`Traffic ${formatTraffic(traffic)}`}>
            Traffic <span className="font-medium text-fg">{formatTraffic(traffic)}</span>
            <CaretDownIcon className="size-3!" />
          </Button>
        </MenuTrigger>
        <MenuContent align="center" className="min-w-44">
          <MenuLabel>Traffic, as a share of each client's rate</MenuLabel>
          <MenuRadioGroup
            value={String(traffic)}
            onValueChange={(value) => simulation.setTraffic(Number(value))}
          >
            {TRAFFIC_LEVELS.map((level) => (
              <MenuRadioItem key={level} value={String(level)}>
                {formatTraffic(level)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      <TimelineToggle />
    </fieldset>
  );
}

/** Show or hide the chaos timeline (S40). */
function TimelineToggle() {
  const open = useUi((s) => s.timelineOpen);
  const events = useDesign((s) => s.doc.scenario?.events.length ?? 0);
  return (
    <IconButton
      label={open ? "Hide the chaos timeline" : "Show the chaos timeline"}
      shortcut={shortcutKeys("timeline")}
      aria-pressed={open}
      onClick={() => uiStore.getState().setTimelineOpen(!open)}
      className={cx("relative", open && "bg-fg/6 text-fg")}
    >
      <ClockCountdownIcon />
      {/* A dot when events are planned but the strip is hidden. */}
      {events > 0 && !open && (
        <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-pill bg-accent" />
      )}
    </IconButton>
  );
}

/**
 * Why the system can't run, shown under the Run button after pressing it
 * (UIUX §10: an inline hint, not a modal). Each problem can point at its
 * component.
 */
function Problems({ open, children }: { open: boolean; children: React.ReactNode }) {
  const doc = useDesign((s) => s.doc);
  const errors = useMemo(() => compile(doc, registry).errors, [doc]);
  const show = open && errors.length > 0;

  return (
    <Popover open={show} onOpenChange={(next) => !next && simulation.dismissProblems()}>
      <PopoverAnchor asChild>
        <span className="inline-flex">{children}</span>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80 p-3!"
        // Keep focus where it was, so Space still runs once it's fixed.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
          <WarningCircleIcon aria-hidden className="size-4 text-fail" />
          Can't run yet
        </p>
        <ul aria-label="Problems" className="flex flex-col gap-1.5">
          {errors.map((error) => (
            <li
              key={`${error.message}-${error.nodeId ?? ""}`}
              className="flex items-start gap-2 text-sm text-fg-2"
            >
              <span className="flex-1">{error.message}</span>
              {error.nodeId && (
                <button
                  type="button"
                  onClick={() => {
                    selectionStore
                      .getState()
                      .select({ nodeIds: [error.nodeId as string], edgeIds: [] });
                    simulation.dismissProblems();
                  }}
                  className="shrink-0 rounded-kbd text-xs font-medium text-accent hover:underline"
                >
                  Show
                </button>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
