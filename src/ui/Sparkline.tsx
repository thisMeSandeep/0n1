import { cx } from "./cx.ts";

type SparklineProps = {
  values: readonly number[];
  /** Points the line spans when full, so a new run fills in from the left. */
  capacity: number;
  label: string;
  className?: string;
};

const WIDTH = 100;
const HEIGHT = 24;

/** A small line of recent values, scaled from zero to the highest. */
export function Sparkline({ values, capacity, label, className }: SparklineProps) {
  const max = Math.max(...values, 0);
  const step = WIDTH / Math.max(1, capacity - 1);
  const points = values
    .map((value, i) => {
      const x = i * step;
      // A 1px margin so a flat line at the top or bottom isn't clipped.
      const y = max > 0 ? HEIGHT - 1 - (value / max) * (HEIGHT - 2) : HEIGHT - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cx("block h-6 w-full overflow-visible", className)}
    >
      <line
        x1="0"
        x2={WIDTH}
        y1={HEIGHT - 0.5}
        y2={HEIGHT - 0.5}
        className="stroke-line"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {values.length > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
