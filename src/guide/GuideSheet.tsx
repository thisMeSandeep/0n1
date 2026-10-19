import { useEffect, useRef } from "react";
import { uiStore, useUi } from "../store/index.ts";
import { cx } from "../ui/cx.ts";
import { Dialog, DialogContent } from "../ui/Dialog.tsx";
import { EntryText } from "./Explain.tsx";
import { CONCEPTS, GLOSSARY, GLOSSARY_GROUPS } from "./glossary.ts";

/**
 * "Reading the numbers" (the guide, part 1): the ideas that tie 0n1's
 * numbers together, then every number, by group. Opened from ⌘K, the ⋯
 * menu, the welcome card, or a number's explanation (which scrolls to it).
 */
export function GuideSheet() {
  const { open, entry } = useUi((s) => s.guide);
  const body = useRef<HTMLDivElement>(null);

  // Opened from one number: show its entry.
  useEffect(() => {
    if (!open || !entry) return;
    const frame = requestAnimationFrame(() =>
      body.current?.querySelector(`#guide-${entry}`)?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, entry]);

  return (
    <Dialog open={open} onOpenChange={(next) => uiStore.getState().setGuideOpen(next)}>
      <DialogContent
        title="Reading the numbers"
        description="What each number in 0n1 means, why it matters, and what good looks like."
        className="w-[min(46rem,calc(100vw-2rem))]"
      >
        <div ref={body} className="flex max-h-[70vh] flex-col gap-8 overflow-y-auto pr-2">
          <section aria-labelledby="guide-ideas">
            <h3 id="guide-ideas" className="mb-3 text-sm font-medium text-fg-2">
              Five ideas that explain most of it
            </h3>
            <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {CONCEPTS.map((concept) => (
                <li key={concept.title} className="rounded-card border border-line bg-surface p-4">
                  <p className="text-base font-medium text-fg">{concept.title}</p>
                  <p className="mt-1 text-sm text-fg-2">{concept.body}</p>
                </li>
              ))}
            </ol>
          </section>

          {GLOSSARY_GROUPS.map((group) => (
            <section key={group} aria-label={group}>
              <h3 className="mb-1 text-sm font-medium text-fg-2">{group}</h3>
              <dl className="flex flex-col">
                {GLOSSARY.filter((e) => e.group === group).map((e) => (
                  <div
                    key={e.id}
                    id={`guide-${e.id}`}
                    className={cx(
                      "scroll-mt-2 border-b border-line py-4 last:border-b-0",
                      e.id === entry && "rounded-control bg-accent-soft px-3",
                    )}
                  >
                    <dt className="mb-1.5 text-base font-semibold text-fg">{e.term}</dt>
                    <dd>
                      <EntryText entry={e} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
