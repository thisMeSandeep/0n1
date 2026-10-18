import { useViewport, ViewportPortal } from "@xyflow/react";
import type { Guide } from "./alignment.ts";

/** The alignment guides of a drag in progress (M02), drawn in canvas space, a hairline at any zoom. */
export function AlignmentGuides({ guides }: { guides: readonly Guide[] }) {
  const { zoom } = useViewport();
  if (guides.length === 0) return null;
  const thickness = 1 / zoom;
  return (
    <ViewportPortal>
      {guides.map((guide) => (
        <div
          key={`${guide.orientation}:${guide.at}`}
          aria-hidden
          data-guide={guide.orientation}
          className="pointer-events-none absolute top-0 left-0 bg-accent/60"
          style={
            guide.orientation === "vertical"
              ? {
                  transform: `translate(${guide.at - thickness / 2}px, ${guide.start}px)`,
                  width: thickness,
                  height: guide.end - guide.start,
                }
              : {
                  transform: `translate(${guide.start}px, ${guide.at - thickness / 2}px)`,
                  width: guide.end - guide.start,
                  height: thickness,
                }
          }
        />
      ))}
    </ViewportPortal>
  );
}
