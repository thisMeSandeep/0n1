import { getNodesBounds, type Node } from "@xyflow/react";

/*
 * Download the canvas as an image (UIUX §10). html-to-image copies the
 * canvas DOM with its computed styles, so the image uses the current theme
 * and shows the live numbers as they are. It's pinned to 1.11.11: React
 * Flow's export example notes later versions don't export correctly.
 *
 * SVG output wraps the canvas in a <foreignObject>: it opens in browsers,
 * but some design tools draw foreignObject poorly. PNG is the safe choice.
 */

export type ImageFormat = "png" | "svg";
/** What to capture: what's on screen, or every component at full size. */
export type ImageArea = "view" | "system";

export type ImageOptions = {
  format: ImageFormat;
  area: ImageArea;
  transparent: boolean;
};

/** Space around the components in a whole-system image (px). */
export const SYSTEM_PADDING = 48;
/** PNGs are drawn at twice the size, so they stay sharp on high-density screens. */
export const PNG_PIXEL_RATIO = 2;

/** Lab chrome that isn't part of the design. */
const LEFT_OUT = [
  "react-flow__panel", // zoom controls, vitals
  "react-flow__minimap",
  "react-flow__attribution",
  "react-flow__handle",
];

function keep(transparent: boolean) {
  return (node: HTMLElement): boolean => {
    if (!(node instanceof Element)) return true;
    if (LEFT_OUT.some((name) => node.classList.contains(name))) return false;
    if (transparent && node.classList.contains("react-flow__background")) return false;
    // Hover details and the canvas overlays (welcome card, empty-canvas hint).
    return !node.hasAttribute("data-hovercard") && !node.hasAttribute("data-export-skip");
  };
}

const canvasColor = (element: Element) =>
  getComputedStyle(element).getPropertyValue("--canvas").trim() || undefined;

/**
 * Draw the canvas. `root` is the `.react-flow` element; `nodes` are React
 * Flow's nodes (with their measured sizes). Returns a data URL.
 */
export async function captureCanvas(
  root: HTMLElement,
  nodes: readonly Node[],
  { format, area, transparent }: ImageOptions,
): Promise<string> {
  // Loaded on first use: most visits never export.
  const { toPng, toSvg } = await import("html-to-image");
  const background = transparent ? undefined : canvasColor(root);
  // A PNG is filled with the background first. An SVG only has the copied
  // element's own background, which moves with the whole-system offset, so
  // it gets a full-size rectangle behind everything instead (withBackground).
  const draw =
    format === "png"
      ? toPng
      : async (node: HTMLElement, options: Parameters<typeof toPng>[1]) =>
          withBackground(await toSvg(node, options), background);
  const common = {
    filter: keep(transparent),
    ...(format === "png" && background ? { backgroundColor: background } : {}),
    ...(format === "png" ? { pixelRatio: PNG_PIXEL_RATIO } : {}),
  };

  if (area === "view") {
    return draw(root, { ...common, width: root.clientWidth, height: root.clientHeight });
  }

  const viewport = root.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("The canvas isn't ready");
  const bounds = getNodesBounds([...nodes]);
  const width = Math.ceil(bounds.width + SYSTEM_PADDING * 2);
  const height = Math.ceil(bounds.height + SYSTEM_PADDING * 2);
  return draw(viewport, {
    ...common,
    width,
    height,
    // Lay the components out at 100%, with the padding around them.
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${SYSTEM_PADDING - bounds.x}px, ${SYSTEM_PADDING - bounds.y}px) scale(1)`,
    },
  });
}

const SVG_DATA_URL = "data:image/svg+xml;charset=utf-8,";

/** Put a full-size background rectangle behind an SVG data URL's content. */
export function withBackground(svgDataUrl: string, color: string | undefined): string {
  if (!color || !svgDataUrl.startsWith(SVG_DATA_URL)) return svgDataUrl;
  const svg = decodeURIComponent(svgDataUrl.slice(SVG_DATA_URL.length));
  const open = svg.indexOf(">") + 1;
  const rect = `<rect width="100%" height="100%" fill="${color.replace(/"/g, "")}"/>`;
  return SVG_DATA_URL + encodeURIComponent(svg.slice(0, open) + rect + svg.slice(open));
}

/** The image's file name: "0n1-url-shortener.png". */
export function imageFileName(slug: string, format: ImageFormat): string {
  return `0n1-${slug}.${format}`;
}
