import * as z from "zod/mini";
import {
  CURRENT_SCHEMA_VERSION,
  edgeSchema,
  nodeSchema,
  type SystemDocument,
  type SystemNode,
} from "../model/document.ts";
import type { Registry } from "../model/registry.ts";
import { NODE_SIZE, snap } from "./placement.ts";

/*
 * Copy and paste (M03). What's copied goes on the system clipboard as JSON
 * text, so it pastes into another system, another tab or another window of
 * 0n1, and reads as plain text anywhere else. Pasting text that isn't 0n1's
 * does nothing.
 */

export const CLIPBOARD_FORMAT = "0n1-clipboard";
const CLIPBOARD_VERSION = 1;

const clipboardSchema = z.object({
  format: z.literal(CLIPBOARD_FORMAT),
  version: z.literal(CLIPBOARD_VERSION),
  /** The document schema the nodes are in. */
  schemaVersion: z.int().check(z.positive()),
  nodes: z.array(nodeSchema).check(z.minLength(1)),
  edges: z.array(z.pick(edgeSchema, { source: true, target: true })),
});

export type Clipboard = z.infer<typeof clipboardSchema>;

/** The selected components, and the connections among them, as clipboard text. Null if none. */
export function clipboardText(doc: SystemDocument, nodeIds: readonly string[]): string | null {
  const ids = new Set(nodeIds);
  const nodes = doc.nodes.filter((n) => ids.has(n.id));
  if (nodes.length === 0) return null;
  const clipboard: Clipboard = {
    format: CLIPBOARD_FORMAT,
    version: CLIPBOARD_VERSION,
    schemaVersion: doc.schemaVersion,
    nodes,
    edges: doc.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map(({ source, target }) => ({ source, target })),
  };
  return JSON.stringify(clipboard);
}

/**
 * What clipboard text holds, if it's 0n1's: components of kinds this
 * version knows (others are left out), and connections among them. Null for
 * anything else, including copies from a newer version of 0n1.
 */
export function readClipboard(text: string, registry: Registry): Clipboard | null {
  if (!text.includes(CLIPBOARD_FORMAT)) return null; // cheap, before parsing someone's essay
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = clipboardSchema.safeParse(raw);
  if (!parsed.success || parsed.data.schemaVersion > CURRENT_SCHEMA_VERSION) return null;
  const nodes = parsed.data.nodes.filter((n) => registry.get(n.type));
  if (nodes.length === 0) return null;
  const ids = new Set(nodes.map((n) => n.id));
  return {
    ...parsed.data,
    nodes,
    edges: parsed.data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}

/** The visible part of the canvas, in canvas coordinates. */
export type Area = { x: number; y: number; width: number; height: number };

/** Each paste onto copies already there lands this much further down and right. */
export const PASTE_OFFSET = 32;
const MAX_STEPS = 50;

/**
 * How far to move pasted components. They keep their places if those are
 * free and in view, so a cut and paste puts things back. Out of view (say,
 * copied from another system), they're centred in it. And where copies
 * already sit at the same spots, each paste steps down and right, as
 * duplicating does.
 */
export function pasteShift(
  nodes: readonly Pick<SystemNode, "position">[],
  existing: readonly Pick<SystemNode, "position">[],
  view: Area | null,
): { x: number; y: number } {
  const left = Math.min(...nodes.map((n) => n.position.x));
  const top = Math.min(...nodes.map((n) => n.position.y));
  const right = Math.max(...nodes.map((n) => n.position.x)) + NODE_SIZE.width;
  const bottom = Math.max(...nodes.map((n) => n.position.y)) + NODE_SIZE.height;
  const inView =
    !view ||
    (left < view.x + view.width && right > view.x && top < view.y + view.height && bottom > view.y);
  const base = inView
    ? { x: 0, y: 0 }
    : {
        x: snap(view.x + view.width / 2 - (left + right) / 2),
        y: snap(view.y + view.height / 2 - (top + bottom) / 2),
      };
  const occupied = (x: number, y: number) =>
    existing.some((e) => Math.abs(e.position.x - x) < 1 && Math.abs(e.position.y - y) < 1);
  for (let step = 0; step < MAX_STEPS; step++) {
    const shift = { x: base.x + step * PASTE_OFFSET, y: base.y + step * PASTE_OFFSET };
    if (!nodes.some((n) => occupied(n.position.x + shift.x, n.position.y + shift.y))) return shift;
  }
  return { x: base.x + MAX_STEPS * PASTE_OFFSET, y: base.y + MAX_STEPS * PASTE_OFFSET };
}
