import {
  ClipboardIcon,
  NotePencilIcon,
  PencilSimpleIcon,
  TrashIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";
import { shortcutKeys } from "../app/shortcuts.ts";
import type { Position } from "../model/document.ts";
import { designStore, uiStore } from "../store/index.ts";
import { MenuItem, MenuSeparator } from "../ui/Menu.tsx";
import { useAddNote } from "./useAddNote.ts";
import { usePaste } from "./useClipboard.ts";
import { useTidyLayout } from "./useTidyLayout.ts";

/** Right-clicking a sticky note (M04). */
export function NoteActionItems({ noteId }: { noteId: string }) {
  return (
    <>
      <MenuItem
        icon={<PencilSimpleIcon />}
        onSelect={() => uiStore.getState().setEditingNote(noteId)}
      >
        Edit text
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<TrashIcon />}
        tone="danger"
        shortcut={shortcutKeys("delete")}
        onSelect={() => designStore.getState().removeNodes([noteId])}
      >
        Delete
      </MenuItem>
    </>
  );
}

/** Right-clicking empty canvas: a note there, paste, or tidy up. */
export function PaneActionItems({ at }: { at: Position }) {
  const { addNoteAt } = useAddNote();
  const { pasteFromMenu } = usePaste();
  const tidy = useTidyLayout();
  return (
    <>
      <MenuItem
        icon={<NotePencilIcon />}
        shortcut={shortcutKeys("addNote")}
        onSelect={() => addNoteAt(at)}
      >
        Add a note here
      </MenuItem>
      <MenuItem
        icon={<ClipboardIcon />}
        shortcut={shortcutKeys("paste")}
        onSelect={() => void pasteFromMenu()}
      >
        Paste
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<TreeStructureIcon />} shortcut={shortcutKeys("tidyLayout")} onSelect={tidy}>
        Tidy layout
      </MenuItem>
    </>
  );
}
