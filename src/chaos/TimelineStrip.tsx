import {
  ArrowsInSimpleIcon,
  BroomIcon,
  HourglassMediumIcon,
  LinkBreakIcon,
  PlusIcon,
  PowerIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import {
  describeEvent,
  type EventKind,
  eventEnd,
  type NewScenarioEvent,
  type ScenarioEvent,
} from "../model/scenario.ts";
import { formatClock } from "../simulation/format.ts";
import { useSimulation } from "../simulation/store.ts";
import { designStore, uiStore, useDesign } from "../store/index.ts";
import { Button, IconButton } from "../ui/Button.tsx";
import { cx } from "../ui/cx.ts";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { EventEditor } from "./EventEditor.tsx";
import { defaultEvent, isActive, lanes, ticks, timelineSpan } from "./timeline.ts";

const KIND_ICON: Readonly<Record<EventKind, ReactNode>> = {
  down: <PowerIcon aria-hidden />,
  slow: <HourglassMediumIcon aria-hidden />,
  cut: <LinkBreakIcon aria-hidden />,
  flush: <BroomIcon aria-hidden />,
  surge: <TrendUpIcon aria-hidden />,
};

const LANE_HEIGHT = 28;

/**
 * The chaos timeline (S40), under the canvas: planned failures as bars on a
 * time axis, with the clock moving across. Changing it restarts the run, so
 * every run plays it from the start.
 */
export function TimelineStrip() {
  const events = useDesign((s) => s.doc.scenario?.events ?? NO_EVENTS);
  const now = useSimulation((s) => s.snapshot?.time ?? 0);
  const span = timelineSpan(events, now);
  const placed = lanes(events);
  const laneCount = Math.max(1, ...[...placed.values()].map((lane) => lane + 1));
  const at = (ms: number) => `${(ms / span) * 100}%`;

  return (
    <section aria-label="Chaos timeline" className="flex shrink-0 border-t border-line bg-surface">
      <div className="flex w-52 shrink-0 flex-col gap-2 border-r border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-fg">Chaos timeline</h2>
          <IconButton
            label="Hide the timeline"
            size="sm"
            onClick={() => uiStore.getState().setTimelineOpen(false)}
          >
            <ArrowsInSimpleIcon />
          </IconButton>
        </div>
        <AddEvent now={now} />
      </div>

      <div className="relative min-w-0 flex-1 px-4 pt-3 pb-1">
        {events.length === 0 && (
          <p className="absolute inset-x-4 top-4 truncate text-sm text-fg-2">
            Nothing planned yet. Add an event to break something on schedule.
          </p>
        )}
        <div className="relative" style={{ height: laneCount * LANE_HEIGHT }}>
          {/* Behind the bars, so it never covers their text. */}
          {now > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute -top-1 -bottom-1 w-px bg-accent"
              style={{ left: at(now) }}
            />
          )}
          {events.map((event) => (
            <EventBar
              key={event.id}
              event={event}
              left={at(event.at)}
              width={
                eventEnd(event) === null
                  ? `calc(100% - ${at(event.at)})`
                  : at((eventEnd(event) ?? event.at) - event.at)
              }
              lane={placed.get(event.id) ?? 0}
              active={isActive(event, now)}
              now={now}
            />
          ))}
        </div>
        <div aria-hidden className="relative mt-1 h-4 text-xs text-fg-2">
          {ticks(span).map((tick) => (
            <span
              key={tick}
              className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: at(tick) }}
            >
              {formatClock(tick)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const NO_EVENTS: readonly ScenarioEvent[] = [];

function AddEvent({ now }: { now: number }) {
  const [open, setOpen] = useState(false);
  const doc = useDesign((s) => s.doc);
  const initial = defaultEvent(doc, "down", now) ?? defaultEvent(doc, "surge", now);
  if (!initial) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" className="self-start">
          <PlusIcon />
          Add event
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="p-4!">
        <EventEditor
          initial={initial}
          now={now}
          saveLabel="Add"
          onSave={(event) => {
            designStore.getState().addEvent(event);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

type EventBarProps = {
  event: ScenarioEvent;
  left: string;
  width: string;
  lane: number;
  active: boolean;
  now: number;
};

function EventBar({ event, left, width, lane, active, now }: EventBarProps) {
  const [open, setOpen] = useState(false);
  const names = useDesign((s) => s.doc);
  const name = (target: string) => {
    const node = names.nodes.find((n) => n.id === target);
    if (node) return node.name;
    const edge = names.edges.find((e) => e.id === target);
    const label = (id: string) => names.nodes.find((n) => n.id === id)?.name ?? "?";
    return edge ? `${label(edge.source)} → ${label(edge.target)}` : "?";
  };
  const text = describeEvent(event, name);
  const { id, ...rest } = event;
  const point = event.kind === "flush";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={`${text}, at ${formatClock(event.at)}`}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${text}, at ${formatClock(event.at)}`}
            className={cx(
              "absolute flex h-6 min-w-6 items-center gap-1.5 overflow-hidden rounded-control border px-1.5 text-xs whitespace-nowrap",
              "transition-colors duration-(--duration-fast) [&_svg]:size-3.5 [&_svg]:shrink-0",
              active
                ? "border-[color-mix(in_srgb,var(--fail)_50%,var(--line))] bg-fail-soft text-fg"
                : "border-line-strong bg-raised text-fg-2 hover:text-fg",
            )}
            style={{
              left,
              top: lane * LANE_HEIGHT,
              ...(point ? {} : { width }),
            }}
          >
            {KIND_ICON[event.kind]}
            <span className="truncate">{text}</span>
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" align="start" className="p-4!">
        <EventEditor
          initial={rest as NewScenarioEvent}
          now={now}
          saveLabel="Save"
          onSave={(next) => {
            designStore.getState().updateEvent(id, next);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
          onDelete={() => {
            designStore.getState().removeEvent(id);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
