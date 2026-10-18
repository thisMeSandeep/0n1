import { useReactFlow } from "@xyflow/react";
import { useCallback, useEffect } from "react";
import { findShortcutById, shouldHandle } from "../app/shortcuts.ts";
import { registry } from "../components/index.ts";
import { designStore, selectionStore } from "../store/index.ts";
import { type Area, clipboardText, pasteShift, readClipboard } from "./clipboard.ts";

/*
 * Copy, cut and paste (M03). ⌘C, ⌘X and ⌘V go through the browser's own
 * events, which carry the system clipboard without asking for permission.
 * Menus use the asynchronous clipboard API, falling back to what was last
 * copied in this tab when the browser won't let 0n1 read the clipboard.
 */

/** What was last copied here, for menus when the clipboard can't be read. */
let lastCopied: string | null = null;

const selected = () => selectionStore.getState().nodeIds;

/** Components (the selection, unless said) as clipboard text; null if there are none. */
export function copySelection(ids: readonly string[] = selected()): string | null {
  const text = clipboardText(designStore.getState().doc, ids);
  if (text) lastCopied = text;
  return text;
}

/** Copy components (the selection, unless said) and remove them: one undo step. */
export function cutSelection(ids: readonly string[] = selected()): string | null {
  const text = copySelection(ids);
  if (text) designStore.getState().removeNodes(ids);
  return text;
}

/** From a menu: copy components to the system clipboard where allowed. */
export async function copySelectionFromMenu(ids: readonly string[] = selected()): Promise<void> {
  const text = copySelection(ids);
  if (text) await navigator.clipboard?.writeText(text).catch(() => {});
}

/** From a menu: cut components, to the system clipboard where allowed. */
export async function cutSelectionFromMenu(ids: readonly string[] = selected()): Promise<void> {
  const text = cutSelection(ids);
  if (text) await navigator.clipboard?.writeText(text).catch(() => {});
}

/** Pasting into the open system. Must be used inside the ReactFlowProvider: it pastes into view. */
export function usePaste() {
  const { screenToFlowPosition } = useReactFlow();

  /** The part of the canvas on screen, in canvas coordinates. */
  const visibleArea = useCallback((): Area | null => {
    const canvas = document.querySelector('[data-testid="canvas"]')?.getBoundingClientRect();
    if (!canvas || canvas.width === 0) return null;
    const topLeft = screenToFlowPosition({ x: canvas.left, y: canvas.top });
    const bottomRight = screenToFlowPosition({ x: canvas.right, y: canvas.bottom });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }, [screenToFlowPosition]);

  /** Paste 0n1 clipboard text and select what was pasted. False if it isn't 0n1's. */
  const paste = useCallback(
    (text: string): boolean => {
      const clipboard = readClipboard(text, registry);
      if (!clipboard) return false;
      const design = designStore.getState();
      const shift = pasteShift(clipboard.nodes, design.doc.nodes, visibleArea());
      const ids = design.pasteNodes(clipboard.nodes, clipboard.edges, shift);
      if (ids.length === 0) return false;
      selectionStore.getState().select({ nodeIds: ids, edgeIds: [] });
      return true;
    },
    [visibleArea],
  );

  /** From a menu: paste the system clipboard if it can be read and is 0n1's, else the last copy here. */
  const pasteFromMenu = useCallback(async () => {
    const text = await navigator.clipboard?.readText().catch(() => null);
    if (!(text && paste(text)) && lastCopied) paste(lastCopied);
  }, [paste]);

  return { paste, pasteFromMenu };
}

/** Whether a copy, cut or paste event is the canvas's to handle, rather than text's. */
function forTheCanvas(event: ClipboardEvent, id: "copy" | "cut" | "paste"): boolean {
  const shortcut = findShortcutById(id);
  const target = document.activeElement ?? event.target;
  if (!shortcut || !shouldHandle(shortcut, target)) return false;
  // Text someone selected (in the inspector, say) is theirs to copy.
  const selected = window.getSelection();
  return !(id !== "paste" && selected && !selected.isCollapsed && selected.toString() !== "");
}

/** Listen for ⌘C, ⌘X and ⌘V (as the browser's clipboard events) while the canvas is open. */
export function useClipboardEvents(): void {
  const { paste } = usePaste();
  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => {
      if (!forTheCanvas(event, "copy")) return;
      const text = copySelection();
      if (!text) return;
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
    };
    const onCut = (event: ClipboardEvent) => {
      if (!forTheCanvas(event, "cut")) return;
      const text = cutSelection();
      if (!text) return;
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!forTheCanvas(event, "paste")) return;
      const text = event.clipboardData?.getData("text/plain");
      if (text && paste(text)) event.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [paste]);
}
