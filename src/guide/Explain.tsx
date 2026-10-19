import { BookOpenTextIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { uiStore } from "../store/index.ts";
import { cx } from "../ui/cx.ts";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../ui/Popover.tsx";
import { type GlossaryEntry, type GlossaryId, glossaryEntry } from "./glossary.ts";

/** An entry's explanation: what it is, why it matters, what good looks like, what moves it. */
export function EntryText({ entry }: { entry: GlossaryEntry }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-base text-fg">{entry.what}</p>
      <p className="text-fg-2">{entry.why}</p>
      {entry.healthy && (
        <p className="text-fg-2">
          <span className="font-medium text-fg">Healthy: </span>
          {entry.healthy}
        </p>
      )}
      {entry.moves && (
        <p className="text-fg-2">
          <span className="font-medium text-fg">What moves it: </span>
          {entry.moves}
        </p>
      )}
    </div>
  );
}

/**
 * A number's label that explains it (the guide, part 1): dotted underline,
 * and a click opens what it means, why it matters and what good looks
 * like, with a way into the full guide.
 */
export function Explain({
  id,
  children,
  className,
}: {
  id: GlossaryId;
  children: ReactNode;
  className?: string;
}) {
  const entry = glossaryEntry(id);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${entry.term.toLowerCase()}?`}
          className={cx(
            "cursor-help rounded-kbd underline decoration-fg-3 decoration-dotted underline-offset-[3px] hover:text-fg hover:decoration-fg-2",
            className,
          )}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={entry.term} className="w-80" side="top">
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-fg">{entry.term}</h3>
          <EntryText entry={entry} />
          <PopoverClose asChild>
            <button
              type="button"
              onClick={() => uiStore.getState().setGuideOpen(true, id)}
              className="flex items-center gap-1.5 self-start rounded-kbd text-sm font-medium text-accent hover:underline"
            >
              <BookOpenTextIcon aria-hidden className="size-4" />
              All the numbers, explained
            </button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
