import { previewSeconds, type ShapeSettings, shapeFactor } from "../components/client/shape.ts";
import { formatClock } from "../simulation/format.ts";
import { Sparkline } from "../ui/Sparkline.tsx";

const POINTS = 120;

/** What a client's traffic shape does over the start of a run (S39). */
export function TrafficShapePreview({ settings }: { settings: ShapeSettings }) {
  const span = previewSeconds(settings);
  const values = Array.from({ length: POINTS }, (_, i) =>
    shapeFactor(settings, (span * i) / (POINTS - 1)),
  );
  return (
    <figure className="m-0 -mt-1">
      <Sparkline
        values={values}
        capacity={POINTS}
        label={`Traffic over the first ${formatClock(span * 1000)} of a run`}
        className="h-9 text-fg-2"
      />
      <figcaption className="mt-1 flex justify-between text-xs text-fg-2">
        <span>00:00</span>
        <span>{formatClock(span * 1000)}</span>
      </figcaption>
    </figure>
  );
}
