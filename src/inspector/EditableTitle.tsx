import { type KeyboardEvent, useState } from "react";

type EditableTitleProps = {
  value: string;
  /** Return false to reject the new value (it reverts). */
  onCommit: (value: string) => boolean;
  label: string;
};

/** A heading you can click and type into. Enter or blur saves; Escape reverts. */
export function EditableTitle({ value, onCommit, label }: EditableTitleProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    else if (event.key === "Escape") {
      const input = event.currentTarget;
      setDraft(null);
      // Blur after the revert has rendered, so commit sees no draft.
      requestAnimationFrame(() => input.blur());
    }
  };

  return (
    <input
      aria-label={label}
      value={draft ?? value}
      maxLength={80}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className="h-7 w-full min-w-0 truncate rounded-control border border-transparent bg-transparent px-1.5 text-md font-semibold text-fg outline-none transition-colors duration-(--duration-fast) hover:border-line focus:border-line-strong focus:bg-raised"
    />
  );
}
