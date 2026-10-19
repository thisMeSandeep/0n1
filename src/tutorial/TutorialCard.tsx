import { XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef } from "react";
import { Explain } from "../guide/Explain.tsx";
import { glossaryEntry } from "../guide/glossary.ts";
import { library } from "../library/index.ts";
import { useSimulation } from "../simulation/store.ts";
import { uiStore, useDesign, useSelection, useUi } from "../store/index.ts";
import { Button, IconButton } from "../ui/Button.tsx";
import { toast } from "../ui/Toast.tsx";
import type { TutorialContext } from "./lesson.ts";
import { findLesson } from "./lessons/firstSystem.ts";
import { Spotlight } from "./Spotlight.tsx";

/** A step that's just been done shows that for a moment before moving on. */
const ADVANCE_DELAY_MS = 700;

const leave = () => uiStore.getState().setTutorial(null);

/**
 * The tutorial in progress (the guide, part 2): a card on the canvas saying
 * what to do and what to look at, with a ring around it. A step moves on by
 * itself once it's done; steps with nothing to do wait for Next.
 */
export function TutorialCard() {
  const progress = useUi((s) => s.tutorial);
  const lesson = progress ? findLesson(progress.lesson) : undefined;
  const index = lesson?.steps.findIndex((s) => s.id === progress?.step) ?? -1;
  const step = lesson?.steps[index];

  const doc = useDesign((s) => s.doc);
  const snapshot = useSimulation((s) => s.snapshot);
  const running = useSimulation((s) => s.running);
  const selected = useSelection((s) => s.nodeIds);
  const context: TutorialContext = useMemo(
    () => ({ doc, snapshot, running, selected }),
    [doc, snapshot, running, selected],
  );
  const inItsSystem = progress !== null && doc.id === progress.systemId;
  const done = step?.done && inItsSystem ? step.done(context) : false;

  const goTo = (offset: number) => {
    const next = lesson?.steps[index + offset];
    if (progress && next) uiStore.getState().setTutorial({ ...progress, step: next.id });
  };

  // Move on when the step becomes done. One that was already done when it
  // showed (after Back, say) waits for Next instead.
  const shown = useRef<{ step: string | undefined; done: boolean }>({ step: undefined, done });
  if (shown.current.step !== step?.id) shown.current = { step: step?.id, done };
  const advance = useRef(() => {});
  advance.current = () => goTo(1);
  useEffect(() => {
    if (!step || !done || shown.current.done) return;
    // Only these two restart the wait, so the live numbers updating don't keep cancelling it.
    const timer = setTimeout(() => advance.current(), ADVANCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [step, done]);

  if (!progress || !lesson || !step) return null;
  const last = index === lesson.steps.length - 1;
  const target =
    inItsSystem && step.target
      ? typeof step.target === "string"
        ? step.target
        : step.target(context)
      : null;

  const backToSystem = () =>
    void library.open(progress.systemId).catch(() => {
      toast({ title: `Couldn't open “${lesson.systemName}”. It may have been deleted.` });
    });

  return (
    <section
      aria-label={`Tutorial: ${lesson.title}`}
      data-export-skip
      className="pointer-events-auto w-80 rounded-card border border-line bg-raised p-4 shadow-raised animate-pop-in"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-fg-2">
          Tutorial · {index + 1} of {lesson.steps.length}
        </p>
        <IconButton label="Leave the tutorial" size="sm" onClick={leave} className="-mr-1.5">
          <XIcon />
        </IconButton>
      </div>
      {inItsSystem ? (
        <>
          <h2 className="mt-1 text-base font-semibold text-fg">{step.title}</h2>
          <div className="mt-2 flex flex-col gap-2 text-sm text-fg-2">
            {step.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          {step.explain && (
            <p className="mt-2 text-sm text-fg-2">
              <Explain id={step.explain}>
                More about {glossaryEntry(step.explain).term.toLowerCase()}
              </Explain>
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-fg-2">
          This tutorial builds in “{lesson.systemName}”, which isn't the system open now.
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => goTo(-1)}>
          Back
        </Button>
        {!inItsSystem ? (
          <Button size="sm" variant="primary" onClick={backToSystem}>
            Back to it
          </Button>
        ) : last ? (
          <Button size="sm" variant="primary" onClick={leave}>
            Finish
          </Button>
        ) : step.done && !done ? (
          <span className="flex items-center gap-3">
            <span className="text-xs text-fg-2">Waiting for you…</span>
            <Button size="sm" variant="ghost" onClick={() => goTo(1)}>
              Skip
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="primary" onClick={() => goTo(1)}>
            Next
          </Button>
        )}
      </div>
      <Spotlight selector={target} />
    </section>
  );
}
