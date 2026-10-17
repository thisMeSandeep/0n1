import { WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { count } from "../inspector/sections.ts";
import { uiStore, useUi } from "../store/index.ts";
import { Button } from "../ui/Button.tsx";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "../ui/Dialog.tsx";
import { toast } from "../ui/Toast.tsx";
import { library } from "./index.ts";

const close = () => uiStore.getState().setRestore(null);

/** Shows what a backup will add before writing anything (UIUX §10). */
export function RestoreDialog() {
  const preview = useUi((s) => s.restore);
  const [busy, setBusy] = useState(false);
  if (!preview) return null;

  if (preview.kind === "error") {
    return (
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent
          title={`Couldn't restore “${preview.fileName}”`}
          description={preview.message}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="primary">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const { systems, skipped } = preview;
  const single = systems.length === 1;
  const restore = async () => {
    setBusy(true);
    try {
      const restored = await library.restore(systems);
      close();
      const [only] = restored;
      toast({
        title:
          single && only
            ? `Restored “${only.name}”`
            : `Restored ${count(restored.length, "system")}`,
        ...(single && only
          ? { action: { label: "Open", onClick: () => void library.open(only.id) } }
          : {}),
      });
    } catch (error) {
      console.error("0n1: restore failed", error);
      toast({ title: "Couldn't restore that backup" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent
        title={single ? `Restore “${systems[0]?.name}”?` : `Restore ${systems.length} systems?`}
        description={
          single
            ? "It'll be added alongside your existing systems. Nothing is overwritten."
            : "They'll be added alongside your existing systems. Nothing is overwritten."
        }
      >
        {!single && (
          <ul
            aria-label="Systems in this backup"
            className="max-h-48 overflow-y-auto rounded-control border border-line text-sm"
          >
            {systems.map((system) => (
              <li
                key={system.id}
                className="flex justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0"
              >
                <span className="truncate">{system.name}</span>
                <span className="shrink-0 text-fg-2">
                  {count(system.nodes.length, "component")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {skipped.length > 0 && (
          <div className="mt-4 flex gap-2.5 rounded-control bg-warn-soft px-3 py-2.5 text-sm">
            <WarningCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              <p>
                {skipped.length === 1
                  ? "1 system in this file couldn't be read and will be skipped:"
                  : `${skipped.length} systems in this file couldn't be read and will be skipped:`}
              </p>
              <p className="text-fg-2">{skipped.map((s) => s.name).join(", ")}</p>
            </div>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="primary" onClick={() => void restore()} disabled={busy}>
            {single ? "Restore system" : `Restore ${systems.length} systems`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
