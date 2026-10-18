import { useEffect, useRef } from "react";
import { GRID } from "../canvas/placement.ts";
import { useViewActions } from "../canvas/useViewActions.ts";
import { simulation } from "../simulation/index.ts";
import { designStore, selectionStore, uiStore, useUi } from "../store/index.ts";
import { Dialog, DialogContent } from "../ui/Dialog.tsx";
import { Kbd } from "../ui/Kbd.tsx";
import {
  findShortcut,
  formatCombo,
  isNavigationKey,
  isSpaceControl,
  SHORTCUTS,
  type ShortcutGroup,
  type ShortcutId,
  shouldHandle,
} from "./shortcuts.ts";

type LabShortcutsProps = {
  paletteOpen: boolean;
  togglePalette: () => void;
  toggleInspector: () => void;
};

const MOVE: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};
/** Shift + arrow moves five grid steps. */
const FAR = 5;

/**
 * The lab's one keyboard listener, dispatching through the shortcut
 * registry, plus the `?` sheet. Must sit inside the ReactFlowProvider.
 */
export function LabShortcuts({ paletteOpen, togglePalette, toggleInspector }: LabShortcutsProps) {
  const view = useViewActions();

  // Handlers read live values through a ref, so the listener is attached once.
  const handlers = useRef<Record<ShortcutId, (event: KeyboardEvent) => void> | null>(null);
  handlers.current = {
    commandPalette: () => {
      const ui = uiStore.getState();
      ui.setCommandPaletteOpen(!ui.commandPaletteOpen);
    },
    shortcuts: () => uiStore.getState().setShortcutsOpen(true),
    searchComponents: () => {
      if (!paletteOpen) togglePalette();
      uiStore.getState().requestPaletteSearch();
    },
    runPause: simulation.toggle,
    step: simulation.step,
    reset: simulation.reset,
    takeDown: () => simulation.toggleDown(selectionStore.getState().nodeIds),
    timeline: () => uiStore.getState().setTimelineOpen(!uiStore.getState().timelineOpen),
    undo: () => designStore.temporal.getState().undo(),
    redo: () => designStore.temporal.getState().redo(),
    duplicate: () => {
      const { nodeIds } = selectionStore.getState();
      if (nodeIds.length === 0) return;
      const copies = designStore.getState().duplicateNodes(nodeIds);
      selectionStore.getState().select({ nodeIds: copies, edgeIds: [] });
    },
    delete: () => {
      const { nodeIds, edgeIds } = selectionStore.getState();
      if (nodeIds.length + edgeIds.length === 0) return;
      const design = designStore.getState();
      design.beginGesture(); // one undo step
      design.disconnect(edgeIds);
      design.removeNodes(nodeIds);
      design.endGesture();
    },
    selectAll: () => {
      const { nodes, edges } = designStore.getState().doc;
      selectionStore.getState().select({
        nodeIds: nodes.map((n) => n.id),
        edgeIds: edges.map((e) => e.id),
      });
    },
    deselect: () => selectionStore.getState().clear(),
    move: (event) => {
      // A focused node moves itself (React Flow's keyboard support).
      if ((event.target as Element | null)?.closest?.(".react-flow__node")) return;
      const direction = MOVE[event.key];
      const { nodeIds } = selectionStore.getState();
      if (!direction || nodeIds.length === 0) return;
      const step = GRID * (event.shiftKey ? FAR : 1);
      const selected = new Set(nodeIds);
      designStore.getState().moveNodes(
        designStore
          .getState()
          .doc.nodes.filter((n) => selected.has(n.id))
          .map((n) => ({
            id: n.id,
            position: {
              x: n.position.x + direction[0] * step,
              y: n.position.y + direction[1] * step,
            },
          })),
      );
    },
    fitView: view.fitView,
    zoomToActual: view.zoomToActual,
    toggleMinimap: () => uiStore.getState().toggleMinimap(),
    togglePalette,
    toggleInspector,
  };

  useEffect(() => {
    let keyboardFocus = false;
    const onPointerDown = () => {
      keyboardFocus = false;
    };
    /**
     * Whether each key press is a shortcut, decided when it first arrives
     * (capture phase), before anything reacts to it. Escape closing a dialog
     * marks it closing during the same press; deciding later would let that
     * Escape also deselect.
     */
    const decided = new WeakMap<KeyboardEvent, ReturnType<typeof findShortcut>>();
    const decide = (event: KeyboardEvent) => {
      const shortcut = findShortcut(event);
      return shortcut && shouldHandle(shortcut, event.target, { keyboardFocus }) ? shortcut : null;
    };
    const run = (event: KeyboardEvent) => {
      const shortcut = decided.get(event);
      if (!shortcut) return;
      event.preventDefault();
      // A clicked button still has focus; move it off so the key's release can't press it too.
      if (event.key === " " && isSpaceControl(event.target)) (event.target as HTMLElement).blur();
      handlers.current?.[shortcut.id](event);
    };
    // Space is taken before it reaches the focused element: a menu trigger
    // opens on Space keydown, and the prevented default tells it not to.
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (isNavigationKey(event.key)) keyboardFocus = true;
      decided.set(event, decide(event));
      if (event.key === " ") run(event);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " ") run(event);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDownCapture, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDownCapture, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return <ShortcutsSheet />;
}

const GROUPS: readonly ShortcutGroup[] = ["General", "Simulation", "Editing", "View", "Panels"];

/** The `?` sheet, generated from the registry. */
function ShortcutsSheet() {
  const open = useUi((s) => s.shortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={(next) => uiStore.getState().setShortcutsOpen(next)}>
      <DialogContent title="Keyboard shortcuts" className="w-[min(52rem,calc(100vw-2rem))]">
        <div className="max-h-[70vh] columns-1 gap-10 overflow-y-auto pr-1 md:columns-2">
          {GROUPS.map((group) => (
            <section key={group} className="mb-6 break-inside-avoid last:mb-0">
              <h3 className="mb-2 text-sm font-medium text-fg-2">{group}</h3>
              <dl className="flex flex-col">
                {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-b-0"
                  >
                    <dt className="text-base text-fg">{shortcut.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1.5">
                      {(shortcut.display
                        ? [shortcut.display]
                        : shortcut.combos.map((c) => formatCombo(c))
                      ).map((keys) => (
                        <Kbd key={keys} className="h-5.5 px-1.5 text-xs text-fg-2">
                          {keys}
                        </Kbd>
                      ))}
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
