import { downloadText, pickFile } from "../app/files.ts";
import { count } from "../inspector/sections.ts";
import type { SystemDocument } from "../model/document.ts";
import {
  BackupError,
  backupFileName,
  buildBackup,
  parseBackup,
  serializeBackup,
} from "../storage/backup.ts";
import { isStorageAvailable } from "../storage/index.ts";
import { designStore, uiStore } from "../store/index.ts";
import { toast } from "../ui/Toast.tsx";
import { library } from "./index.ts";

/** Download every system (or just the open one, if storage is unavailable). */
export async function backUpAll(): Promise<void> {
  const docs = isStorageAvailable() ? await library.collectAll() : [designStore.getState().doc];
  downloadText(backupFileName(null), serializeBackup(buildBackup(docs)));
  toast({ title: "Backup saved", description: `${count(docs.length, "system")} in the file.` });
}

/** Download one system. */
export async function backUpSystem(id: string): Promise<void> {
  const doc = await library.latest(id);
  if (!doc) return;
  downloadText(backupFileName(doc.name), serializeBackup(buildBackup([doc])));
  toast({ title: `Backed up “${doc.name}”` });
}

export type RestorePreview =
  | {
      kind: "preview";
      fileName: string;
      systems: SystemDocument[];
      skipped: { name: string; reason: string }[];
    }
  | { kind: "error"; fileName: string; message: string };

/** Pick a file and show what restoring it would add (see RestoreDialog). */
export async function startRestore(): Promise<void> {
  const file = await pickFile(".json,application/json");
  if (!file) return;
  const show = (preview: RestorePreview) => uiStore.getState().setRestore(preview);

  if (!isStorageAvailable()) {
    show({
      kind: "error",
      fileName: file.name,
      message: "This browser isn't letting 0n1 store data, so there's nowhere to restore to.",
    });
    return;
  }
  try {
    const parsed = parseBackup(await file.text());
    show({ kind: "preview", fileName: file.name, ...parsed });
  } catch (error) {
    show({
      kind: "error",
      fileName: file.name,
      message: error instanceof BackupError ? error.message : "This file couldn't be read.",
    });
  }
}
