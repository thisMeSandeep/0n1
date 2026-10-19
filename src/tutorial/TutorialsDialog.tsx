import { CheckCircleIcon } from "@phosphor-icons/react";
import { uiStore, useUi } from "../store/index.ts";
import { Dialog, DialogContent } from "../ui/Dialog.tsx";
import { LESSONS } from "./lessons/index.ts";
import { startTutorial } from "./start.ts";

/** Every lesson, with how long it takes and whether it's been done. Each starts in a system of its own. */
export function TutorialsDialog() {
  const open = useUi((s) => s.tutorialsOpen);
  const done = useUi((s) => s.tutorialsDone);
  const current = useUi((s) => s.tutorial?.lesson);
  return (
    <Dialog open={open} onOpenChange={(next) => uiStore.getState().setTutorialsOpen(next)}>
      <DialogContent
        title="Tutorials"
        description="Short lessons, each in a system of its own. Do what the card says; it moves on by itself."
        className="w-[min(36rem,calc(100vw-2rem))]"
      >
        <ol aria-label="Lessons" className="flex flex-col gap-2">
          {LESSONS.map((lesson, i) => (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => void startTutorial(lesson.id)}
                className="flex w-full items-start gap-3 rounded-card border border-line bg-surface p-4 text-left transition-colors duration-(--duration-fast) hover:border-line-strong hover:bg-raised"
              >
                <span aria-hidden className="mt-0.5 w-4 shrink-0 text-right text-sm text-fg-2">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-medium text-fg">{lesson.title}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-2">
                      {done.includes(lesson.id) && (
                        <CheckCircleIcon
                          aria-label="Done"
                          weight="fill"
                          className="size-3.5 text-ok"
                        />
                      )}
                      {current === lesson.id ? "In progress" : `${lesson.minutes} min`}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-fg-2">{lesson.summary}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
