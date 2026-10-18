import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  EVENT_KINDS,
  EVENT_LABEL,
  type EventKind,
  MAX_FACTOR,
  type NewScenarioEvent,
} from "../model/scenario.ts";
import { useDesign } from "../store/index.ts";
import { Button } from "../ui/Button.tsx";
import { NumberField } from "../ui/NumberField.tsx";
import { SelectField } from "../ui/SelectField.tsx";
import { SwitchField } from "../ui/Switch.tsx";
import { defaultEvent, targetOptions } from "./timeline.ts";

/** The longest a planned event can wait, or last (s). */
const MAX_SECONDS = 3600;

const NO_TARGET: Readonly<Record<EventKind, string>> = {
  down: "No components yet",
  slow: "No components to slow down",
  cut: "No connections yet",
  flush: "No caches in this system",
  surge: "",
};

type EventEditorProps = {
  initial: NewScenarioEvent;
  /** The clock, for placing a new event when the kind changes. */
  now: number;
  saveLabel: string;
  onSave: (event: NewScenarioEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

/** Plan one event on the chaos timeline (S40): what, to which part, when, and for how long. */
export function EventEditor({
  initial,
  now,
  saveLabel,
  onSave,
  onCancel,
  onDelete,
}: EventEditorProps) {
  const doc = useDesign((s) => s.doc);
  const [draft, setDraft] = useState<NewScenarioEvent>(initial);
  const [kind, setKind] = useState<EventKind>(initial.kind);
  const options = targetOptions(doc, kind);
  const valid = kind === "surge" || options.length > 0;

  const changeKind = (next: EventKind) => {
    setKind(next);
    const event = defaultEvent(doc, next, now, draft);
    if (event) setDraft(event);
  };
  const seconds = (ms: number) => ms / 1000;

  return (
    <form
      aria-label={saveLabel === "Add" ? "New event" : "Edit event"}
      className="flex w-72 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSave(draft);
      }}
    >
      <SelectField
        label="What"
        value={kind}
        options={EVENT_KINDS.map((k) => ({ value: k, label: EVENT_LABEL[k] }))}
        onChange={(value) => changeKind(value as EventKind)}
      />
      {kind !== "surge" && (
        <SelectField
          label={kind === "cut" ? "Connection" : kind === "flush" ? "Cache" : "Component"}
          value={"target" in draft ? draft.target : ""}
          options={options}
          empty={NO_TARGET[kind]}
          onChange={(target) => setDraft({ ...draft, target } as NewScenarioEvent)}
        />
      )}
      <Row label="At">
        <NumberField
          aria-label="At"
          value={seconds(draft.at)}
          min={0}
          max={MAX_SECONDS}
          step={0.5}
          unit="s"
          onChange={(value) => setDraft({ ...draft, at: value * 1000 })}
          className="w-28"
        />
      </Row>
      {"factor" in draft && (
        <Row label={draft.kind === "surge" ? "Traffic ×" : "Work takes ×"}>
          <NumberField
            aria-label={draft.kind === "surge" ? "Traffic ×" : "Work takes ×"}
            value={draft.factor}
            min={1.1}
            max={MAX_FACTOR}
            scale="log"
            unit="×"
            onChange={(factor) => setDraft({ ...draft, factor })}
            className="w-28"
          />
        </Row>
      )}
      {draft.kind === "down" && (
        <SwitchField
          label="Until the end of the run"
          checked={draft.duration === null}
          onChange={(forever) => setDraft({ ...draft, duration: forever ? null : 20_000 })}
        />
      )}
      {"duration" in draft && draft.duration !== null && (
        <Row label="For">
          <NumberField
            aria-label="For"
            value={seconds(draft.duration)}
            min={0.5}
            max={MAX_SECONDS}
            step={0.5}
            unit="s"
            onChange={(value) => setDraft({ ...draft, duration: value * 1000 } as NewScenarioEvent)}
            className="w-28"
          />
        </Row>
      )}

      <div className="mt-1 flex items-center gap-2">
        {onDelete && (
          <Button type="button" variant="danger" size="sm" onClick={onDelete}>
            <TrashIcon />
            Delete
          </Button>
        )}
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!valid}>
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-base text-fg">{label}</span>
      {children}
    </div>
  );
}
