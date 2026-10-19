import type { Node, NodeProps } from "@xyflow/react";
import { type KeyboardEvent, memo, useEffect, useRef } from "react";
import { NOTE_MAX_LENGTH } from "../model/document.ts";
import { designStore, uiStore, useUi } from "../store/index.ts";
import { cx } from "../ui/cx.ts";

/*
 * A sticky note on the canvas (M04): words for whoever reads the design.
 * Double-click to write (Canvas.tsx); click away, or press Esc or ⌘↵, to finish.
 * The simulation never sees it.
 */

export type NoteNodeData = { text: string };
export type NoteFlowNode = Node<NoteNodeData, "note">;

/** Frames to keep trying to focus a new note's field (about half a second). */
const FOCUS_TRIES = 30;

/** Notes are this wide (px); they grow down as the text does. */
export const NOTE_WIDTH = 224;

export const NoteNode = memo(function NoteNode({ id, data, selected }: NodeProps<NoteFlowNode>) {
  const editing = useUi((s) => s.editingNote === id);
  const field = useRef<HTMLTextAreaElement>(null);
  // Focus once it's on screen: a new note is hidden until React Flow has measured it,
  // which can take a few frames, and a hidden field can't take focus (autoFocus would
  // miss, and keys would go to the canvas). So try each frame until it takes.
  useEffect(() => {
    if (!editing) return;
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      field.current?.focus();
      if (document.activeElement !== field.current && ++tries < FOCUS_TRIES) {
        frame = requestAnimationFrame(attempt);
      }
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [editing]);
  const finish = (text: string) => {
    designStore.getState().updateNote(id, text);
    uiStore.getState().setEditingNote(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      event.stopPropagation(); // Esc finishes writing; it doesn't also deselect
      finish(event.currentTarget.value);
    }
  };

  return (
    <div
      data-note
      style={{ width: NOTE_WIDTH }}
      className={cx(
        "rounded-card border border-note-line bg-note px-3.5 py-3 text-base text-fg outline-2 outline-offset-2",
        "transition-[outline-color] duration-(--duration-fast)",
        selected ? "outline-accent" : "outline-transparent",
      )}
    >
      {editing ? (
        <textarea
          ref={field}
          aria-label="Note"
          defaultValue={data.text}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Write a note"
          onBlur={(event) => finish(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          onFocus={(event) => {
            // Carry on writing at the end.
            const end = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(end, end);
          }}
          // nodrag/nowheel: selecting text and scrolling stay inside the note.
          className="nodrag nowheel block min-h-16 w-full resize-none bg-transparent text-base text-fg outline-none [field-sizing:content] placeholder:text-fg-3"
        />
      ) : data.text ? (
        <p className="break-words whitespace-pre-wrap">{data.text}</p>
      ) : (
        <p className="text-fg-3">Double-click to write a note</p>
      )}
    </div>
  );
});
