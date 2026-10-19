import { NoteIcon, TrashIcon } from "@phosphor-icons/react";
import { NOTE_MAX_LENGTH } from "../model/document.ts";
import { designStore, useDesign } from "../store/index.ts";
import { Button } from "../ui/Button.tsx";
import { InspectorHeader, InspectorSection } from "./InspectorHeader.tsx";

/** A selected sticky note (M04): its text, and a way to delete it. */
export function NoteView({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const note = useDesign((s) => s.doc.notes?.find((n) => n.id === noteId));
  if (!note) return null;
  return (
    <>
      <InspectorHeader
        icon={<NoteIcon aria-hidden weight="duotone" className="size-5 text-fg-2" />}
        title={<h2 className="px-1.5 text-md leading-7 font-semibold">Note</h2>}
        subtitle="Sticky note"
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        <InspectorSection title="Text">
          <textarea
            // A new key per note and per outside edit, so the field shows the latest text.
            key={`${noteId}:${note.text}`}
            aria-label="Note text"
            defaultValue={note.text}
            maxLength={NOTE_MAX_LENGTH}
            rows={6}
            placeholder="Write a note"
            // One undo step per edit, when the field is left.
            onBlur={(event) => designStore.getState().updateNote(noteId, event.currentTarget.value)}
            className="w-full resize-y rounded-control border border-line-strong bg-raised px-2.5 py-2 text-base text-fg outline-none placeholder:text-fg-3 focus:outline-2 focus:outline-offset-2 focus:outline-accent"
          />
          <p className="-mt-3 text-sm text-fg-2">
            For people reading the design. The simulation ignores it.
          </p>
        </InspectorSection>
        <div className="pt-6">
          <Button variant="danger" onClick={() => designStore.getState().removeNodes([noteId])}>
            <TrashIcon />
            Delete note
          </Button>
        </div>
      </div>
    </>
  );
}
