import { XIcon } from "@phosphor-icons/react";
import * as RadixToast from "@radix-ui/react-toast";
import { useSyncExternalStore } from "react";
import { Button, IconButton } from "./Button.tsx";

/* Toasts are only for things that happen outside the user's view (UIUX §10). */

const DEFAULT_DURATION_MS = 4000;
/** Time for the exit animation before a closed toast is dropped. */
const REMOVE_DELAY_MS = 400;

export type ToastOptions = {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
};

type ToastEntry = ToastOptions & { id: number; open: boolean };

let entries: ToastEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: ToastEntry[]) {
  entries = next;
  for (const listener of listeners) listener();
}

export function toast(options: ToastOptions): number {
  const id = nextId++;
  emit([...entries, { ...options, id, open: true }]);
  return id;
}

export function dismissToast(id: number): void {
  emit(entries.map((entry) => (entry.id === id ? { ...entry, open: false } : entry)));
  setTimeout(() => emit(entries.filter((entry) => entry.id !== id)), REMOVE_DELAY_MS);
}

export const toastStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => entries,
};

export function Toaster() {
  const toasts = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getSnapshot,
  );

  return (
    <RadixToast.Provider swipeDirection="right" duration={DEFAULT_DURATION_MS}>
      {toasts.map((entry) => (
        <RadixToast.Root
          key={entry.id}
          open={entry.open}
          onOpenChange={(open) => !open && dismissToast(entry.id)}
          {...(entry.durationMs ? { duration: entry.durationMs } : {})}
          className={
            "flex items-center gap-3 rounded-card border border-line bg-raised py-2.5 pr-2 pl-4 text-fg shadow-raised " +
            "data-[state=closed]:animate-fade-out data-[state=open]:animate-toast-in " +
            "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:animate-fade-out"
          }
        >
          <div className="min-w-0 flex-1">
            <RadixToast.Title className="text-base">{entry.title}</RadixToast.Title>
            {entry.description && (
              <RadixToast.Description className="text-sm text-fg-2">
                {entry.description}
              </RadixToast.Description>
            )}
          </div>
          {entry.action && (
            <RadixToast.Action altText={entry.action.label} asChild>
              <Button variant="primary" size="sm" onClick={entry.action.onClick}>
                {entry.action.label}
              </Button>
            </RadixToast.Action>
          )}
          <RadixToast.Close asChild>
            <IconButton label="Dismiss" size="sm" tooltip={false}>
              <XIcon />
            </IconButton>
          </RadixToast.Close>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="fixed right-4 bottom-4 z-60 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
    </RadixToast.Provider>
  );
}
