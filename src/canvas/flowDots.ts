/*
 * Flow dots (UIUX §6): a few dots travelling along each connection while a
 * system runs. They show flow, not individual requests.
 *
 * One animation loop moves every dot. Each path is sampled into a table of
 * points when its shape changes, so a frame is only lookups and attribute
 * writes. The loop runs only while playing: pausing freezes the dots where
 * they are.
 */

/** How fast dots travel, in canvas pixels per second. */
export const DOT_SPEED = 70;
/** Path sampling step (canvas pixels). */
const STEP = 2;

export type FlowTrack = {
  /** Where the dots are along the path: 0 ≤ offset < spacing. */
  offset: number;
  points: Float32Array;
  length: number;
  dots: readonly SVGCircleElement[];
};

const tracks = new Set<FlowTrack>();
let playing = false;
let frame = 0;
let lastTime = 0;

/** Sample a path's shape. Call again whenever its `d` changes. */
export function samplePath(path: SVGPathElement): { points: Float32Array; length: number } {
  const length = path.getTotalLength();
  const count = Math.max(2, Math.ceil(length / STEP) + 1);
  const points = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const point = path.getPointAtLength(Math.min(length, i * STEP));
    points[i * 2] = point.x;
    points[i * 2 + 1] = point.y;
  }
  return { points, length };
}

/** Put a track's dots where its offset says, evenly spaced along the path. */
export function placeDots(track: FlowTrack): void {
  const { dots, points, length } = track;
  if (dots.length === 0 || length === 0) return;
  const spacing = length / dots.length;
  const last = points.length / 2 - 1;
  for (let i = 0; i < dots.length; i++) {
    const at = (track.offset + i * spacing) % length;
    const index = Math.min(last, Math.round(at / STEP));
    const dot = dots[i] as SVGCircleElement;
    dot.setAttribute("cx", String(points[index * 2]));
    dot.setAttribute("cy", String(points[index * 2 + 1]));
  }
}

/** Move every track on by `elapsedMs`. */
export function advance(elapsedMs: number): void {
  const distance = (DOT_SPEED * elapsedMs) / 1000;
  for (const track of tracks) {
    if (track.dots.length === 0 || track.length === 0) continue;
    const spacing = track.length / track.dots.length;
    track.offset = (track.offset + distance) % spacing;
    placeDots(track);
  }
}

function tick(time: number) {
  // Cap the step, so dots don't jump after the tab was in the background.
  advance(Math.min(100, time - lastTime));
  lastTime = time;
  frame = requestAnimationFrame(tick);
}

export function setPlaying(next: boolean): void {
  if (next === playing) return;
  playing = next;
  if (playing) {
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(frame);
  }
}

export function addTrack(track: FlowTrack): () => void {
  tracks.add(track);
  placeDots(track);
  return () => {
    tracks.delete(track);
  };
}

/** For tests. */
export function trackCount(): number {
  return tracks.size;
}
