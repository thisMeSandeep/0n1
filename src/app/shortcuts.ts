import { isTypingTarget } from "./layout.ts";

/**
 * Every keyboard shortcut in the lab (UIUX §11), in one place. The global
 * handler, the `?` sheet, tooltips and menus all read from here, so they
 * can't drift apart.
 */

export type KeyCombo = {
  /** `KeyboardEvent.key`: "z", "Backspace", "ArrowUp", "?", "[". */
  key: string;
  /** ⌘ on Mac, Ctrl elsewhere. */
  mod?: boolean;
  /** Only checked for letters; for symbols the key itself already says it ("?" is Shift + /). */
  shift?: boolean;
};

export type ShortcutGroup = "General" | "Simulation" | "Editing" | "View" | "Panels";

export type Shortcut = {
  id: ShortcutId;
  label: string;
  group: ShortcutGroup;
  combos: readonly KeyCombo[];
  /** Global shortcuts also work while typing or inside menus and dialogs (e.g. ⌘K). */
  global?: boolean;
  /** Override how the keys are shown in the sheet. */
  display?: string;
  /**
   * Handled through the browser's own event rather than the key (copy, cut,
   * paste: canvas/useClipboard.ts), so the system clipboard works. The key
   * handler leaves it alone; the sheet still lists it.
   */
  native?: boolean;
};

export const SHORTCUT_IDS = [
  "commandPalette",
  "shortcuts",
  "searchComponents",
  "runPause",
  "step",
  "reset",
  "takeDown",
  "timeline",
  "undo",
  "redo",
  "duplicate",
  "copy",
  "cut",
  "paste",
  "delete",
  "selectAll",
  "deselect",
  "move",
  "fitView",
  "zoomToActual",
  "toggleMinimap",
  "togglePalette",
  "toggleInspector",
] as const;
export type ShortcutId = (typeof SHORTCUT_IDS)[number];
/** Shortcuts the browser's copy, cut and paste events handle (see `native`). */
export type NativeShortcutId = "copy" | "cut" | "paste";
/** Shortcuts the key handler runs. */
export type KeyShortcutId = Exclude<ShortcutId, NativeShortcutId>;

const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].map((key) => ({ key }));

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: "commandPalette",
    label: "Command palette",
    group: "General",
    combos: [{ key: "k", mod: true }],
    global: true,
  },
  { id: "shortcuts", label: "Keyboard shortcuts", group: "General", combos: [{ key: "?" }] },
  { id: "searchComponents", label: "Search components", group: "General", combos: [{ key: "/" }] },
  {
    id: "runPause",
    label: "Run or pause",
    group: "Simulation",
    combos: [{ key: " " }],
    display: "Space",
  },
  { id: "step", label: "Step 1 second", group: "Simulation", combos: [{ key: "." }] },
  { id: "reset", label: "Reset the run", group: "Simulation", combos: [{ key: "r", shift: true }] },
  {
    id: "timeline",
    label: "Show or hide the chaos timeline",
    group: "Simulation",
    combos: [{ key: "t" }],
  },
  {
    id: "takeDown",
    label: "Take down or bring back the selection",
    group: "Simulation",
    combos: [{ key: "k" }],
  },
  { id: "undo", label: "Undo", group: "Editing", combos: [{ key: "z", mod: true }] },
  {
    id: "redo",
    label: "Redo",
    group: "Editing",
    combos: [
      { key: "z", mod: true, shift: true },
      { key: "y", mod: true },
    ],
  },
  {
    id: "duplicate",
    label: "Duplicate selection",
    group: "Editing",
    combos: [{ key: "d", mod: true }],
  },
  {
    id: "copy",
    label: "Copy selected components",
    group: "Editing",
    combos: [{ key: "c", mod: true }],
    native: true,
  },
  {
    id: "cut",
    label: "Cut selected components",
    group: "Editing",
    combos: [{ key: "x", mod: true }],
    native: true,
  },
  {
    id: "paste",
    label: "Paste components, here or in another system",
    group: "Editing",
    combos: [{ key: "v", mod: true }],
    native: true,
  },
  {
    id: "delete",
    label: "Delete selection",
    group: "Editing",
    combos: [{ key: "Backspace" }, { key: "Delete" }],
  },
  {
    id: "selectAll",
    label: "Select everything",
    group: "Editing",
    combos: [{ key: "a", mod: true }],
  },
  { id: "deselect", label: "Deselect", group: "Editing", combos: [{ key: "Escape" }] },
  {
    id: "move",
    label: "Move selected components (hold Shift to move further)",
    group: "Editing",
    combos: arrows,
    display: "← ↑ → ↓",
  },
  { id: "fitView", label: "Fit to view", group: "View", combos: [{ key: "f" }] },
  { id: "zoomToActual", label: "Zoom to 100%", group: "View", combos: [{ key: "1" }] },
  { id: "toggleMinimap", label: "Show or hide the minimap", group: "View", combos: [{ key: "m" }] },
  {
    id: "togglePalette",
    label: "Collapse or expand the components panel",
    group: "Panels",
    combos: [{ key: "[" }],
  },
  {
    id: "toggleInspector",
    label: "Collapse or expand the inspector",
    group: "Panels",
    combos: [{ key: "]" }],
  },
];

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

type KeyLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

const isLetter = (key: string) => /^[a-z]$/i.test(key);

export function matchesCombo(event: KeyLike, combo: KeyCombo, mac = isMac): boolean {
  if (event.altKey) return false;
  const mod = mac ? event.metaKey : event.ctrlKey;
  const otherMod = mac ? event.ctrlKey : event.metaKey;
  if (Boolean(combo.mod) !== mod || otherMod) return false;
  if (isLetter(combo.key)) {
    return event.key.toLowerCase() === combo.key && Boolean(combo.shift) === event.shiftKey;
  }
  return event.key === combo.key;
}

export function findShortcut(event: KeyLike, mac = isMac): Shortcut | null {
  return SHORTCUTS.find((s) => s.combos.some((c) => matchesCombo(event, c, mac))) ?? null;
}

/** Inside a menu, dialog, popover list or command palette: leave keys to it. */
function isOverlayTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const overlay = (target as Element).closest(
    '[role="dialog"], [role="menu"], [role="listbox"], [cmdk-root]',
  );
  // One that's closing (its exit animation still playing) no longer owns the keys.
  return overlay !== null && overlay.getAttribute("data-state") !== "closed";
}

/** A focused control that Space presses or toggles. */
export function isSpaceControl(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return (
    (target as Element).closest(
      'button, a[href], summary, [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"], [role="tab"]',
    ) !== null
  );
}

/** Keys that mean someone is moving around with the keyboard. */
const NAVIGATION_KEYS = new Set([
  "Tab",
  "Enter",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

export function isNavigationKey(key: string): boolean {
  return NAVIGATION_KEYS.has(key);
}

/**
 * Whether a matched shortcut should run for this event's target.
 * `keyboardFocus`: focus got where it is by keyboard, not left behind by a click.
 */
export function shouldHandle(
  shortcut: Shortcut,
  target: EventTarget | null,
  { keyboardFocus = false } = {},
): boolean {
  if (shortcut.global) return true;
  if (isTypingTarget(target) || isOverlayTarget(target)) return false;
  // Someone tabbing around expects Space to press the focused button. After a
  // click (focus stays on the button, or goes back to a menu's trigger),
  // Space should still run.
  const usesSpace = shortcut.combos.some((c) => c.key === " ");
  return !(usesSpace && keyboardFocus && isSpaceControl(target));
}

const MAC_KEYS: Record<string, string> = {
  " ": "Space",
  Backspace: "⌫",
  Delete: "⌦",
  Escape: "Esc",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};
const OTHER_KEYS: Record<string, string> = { ...MAC_KEYS, Backspace: "Backspace", Delete: "Del" };

/** "⌘⇧Z" on Mac, "Ctrl+Shift+Z" elsewhere. */
export function formatCombo(combo: KeyCombo, mac = isMac): string {
  const names = mac ? MAC_KEYS : OTHER_KEYS;
  const key = names[combo.key] ?? (isLetter(combo.key) ? combo.key.toUpperCase() : combo.key);
  if (mac) return `${combo.mod ? "⌘" : ""}${combo.shift ? "⇧" : ""}${key}`;
  return [combo.mod && "Ctrl", combo.shift && "Shift", key].filter(Boolean).join("+");
}

/** The primary keys for a shortcut, for tooltips and menus. */
export function findShortcutById(id: ShortcutId): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

export function shortcutKeys(id: ShortcutId, mac = isMac): string {
  const shortcut = findShortcutById(id);
  const combo = shortcut?.combos[0];
  return combo ? formatCombo(combo, mac) : "";
}
