import { useMemo } from "react";
import { registry } from "../components/index.ts";
import type { SystemLayout } from "../model/layout.ts";
import { cx } from "../ui/cx.ts";
import { THUMBNAIL, thumbnailGeometry } from "./thumbnail.ts";

/** A system's shape at a glance (M01). Decorative: its name says which it is. */
export function SystemThumbnail({
  layout,
  className,
}: {
  layout: SystemLayout;
  className?: string;
}) {
  const { boxes, lines } = useMemo(() => thumbnailGeometry(layout), [layout]);
  return (
    <svg
      aria-hidden
      data-thumbnail
      width={THUMBNAIL.width}
      height={THUMBNAIL.height}
      viewBox={`0 0 ${THUMBNAIL.width} ${THUMBNAIL.height}`}
      className={cx("shrink-0 rounded-kbd border border-line bg-canvas", className)}
    >
      {lines.map((l, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity of their own, and are redrawn whole
        <line key={i} {...l} stroke="var(--edge)" strokeWidth={0.75} />
      ))}
      {boxes.map((b) => {
        const category = registry.get(b.type)?.category;
        return (
          <rect
            key={b.id}
            data-box
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            rx={Math.min(1.5, b.height / 3)}
            // The category's tint, as on the palette's icons; neutral if it's unknown.
            fill={category ? `var(--cat-${category})` : "var(--line-strong)"}
          />
        );
      })}
    </svg>
  );
}
