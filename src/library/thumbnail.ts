import { NODE_SIZE } from "../canvas/placement.ts";
import type { SystemLayout } from "../model/layout.ts";

/*
 * A system's thumbnail (M01): its components as small boxes where they sit
 * on the canvas, and its connections as lines, scaled to fit, shape kept.
 */

/** The thumbnail's size in CSS pixels, and the space kept clear inside its frame. */
export const THUMBNAIL = { width: 56, height: 36, padding: 4 } as const;
/** At most this scale, so a system of one or two components isn't drawn huge. */
const MAX_SCALE = 0.12;

export type ThumbnailBox = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ThumbnailLine = { x1: number; y1: number; x2: number; y2: number };

const round = (n: number) => Math.round(n * 10) / 10;

export function thumbnailGeometry(layout: SystemLayout): {
  boxes: ThumbnailBox[];
  lines: ThumbnailLine[];
} {
  if (layout.nodes.length === 0) return { boxes: [], lines: [] };
  const left = Math.min(...layout.nodes.map((n) => n.x));
  const top = Math.min(...layout.nodes.map((n) => n.y));
  const width = Math.max(...layout.nodes.map((n) => n.x)) + NODE_SIZE.width - left;
  const height = Math.max(...layout.nodes.map((n) => n.y)) + NODE_SIZE.height - top;
  const scale = Math.min(
    MAX_SCALE,
    (THUMBNAIL.width - 2 * THUMBNAIL.padding) / width,
    (THUMBNAIL.height - 2 * THUMBNAIL.padding) / height,
  );
  // Centred in the frame.
  const offsetX = (THUMBNAIL.width - width * scale) / 2;
  const offsetY = (THUMBNAIL.height - height * scale) / 2;
  const at = (x: number, y: number) => ({
    x: offsetX + (x - left) * scale,
    y: offsetY + (y - top) * scale,
  });

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const boxes = layout.nodes.map((n) => {
    const corner = at(n.x, n.y);
    return {
      id: n.id,
      type: n.type,
      x: round(corner.x),
      y: round(corner.y),
      width: round(NODE_SIZE.width * scale),
      height: round(NODE_SIZE.height * scale),
    };
  });
  // From the source's right edge to the target's left, as connections run on the canvas.
  const lines: ThumbnailLine[] = [];
  for (const edge of layout.edges) {
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    if (!from || !to) continue;
    const start = at(from.x + NODE_SIZE.width, from.y + NODE_SIZE.height / 2);
    const end = at(to.x, to.y + NODE_SIZE.height / 2);
    lines.push({ x1: round(start.x), y1: round(start.y), x2: round(end.x), y2: round(end.y) });
  }
  return { boxes, lines };
}
