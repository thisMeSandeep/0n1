import { useEffect, useRef, useState } from "react";
import type uPlot from "uplot";
import { cx } from "./cx.ts";

/** uPlot loads on first use, so the lab doesn't download it until a chart shows. */
let loading: Promise<typeof uPlot> | null = null;
const loadUPlot = () => {
  loading ??= Promise.all([import("uplot"), import("uplot/dist/uPlot.min.css")]).then(
    ([module]) => module.default,
  );
  return loading;
};

type TimeChartProps = {
  /** Seconds. */
  time: readonly number[];
  values: readonly (number | null)[];
  /** A colour token, e.g. "--text-2" or "--fail". */
  color: string;
  /** Formats axis ticks and the hovered value. */
  format: (value: number) => string;
  /** Formats the time axis and the hovered time. */
  formatTime: (seconds: number) => string;
  /** Shown above the chart, e.g. "Throughput". */
  title: string;
  /** For screen readers, e.g. "Throughput over time". */
  label: string;
  height?: number;
  className?: string;
};

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Canvas charts need a 2D context; jsdom has none. */
const canDraw = () => {
  try {
    return document.createElement("canvas").getContext("2d") !== null;
  } catch {
    return false;
  }
};

/** Re-render when the theme changes, so the chart picks up the new colours. */
function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setVersion((v) => v + 1));
    observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return version;
}

/**
 * A streaming line over time (uPlot), themed with our tokens. Hovering shows
 * the value at that moment.
 */
export function TimeChart({
  time,
  values,
  color,
  format,
  formatTime,
  title,
  label,
  height = 96,
  className,
}: TimeChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  const formatRef = useRef({ format, formatTime });
  formatRef.current = { format, formatTime };
  const [hovered, setHovered] = useState<string | null>(null);
  const theme = useThemeVersion();
  const data = useRef({ time, values });
  data.current = { time, values };

  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt only for a new colour or theme; data streams in below.
  useEffect(() => {
    const element = container.current;
    if (!element || !canDraw()) return;
    let plot: uPlot | null = null;
    let resize: ResizeObserver | null = null;
    let cancelled = false;
    void loadUPlot().then((UPlot) => {
      if (cancelled) return;
      plot = create(UPlot, element);
      chart.current = plot;
      plot.setData([data.current.time as number[], data.current.values as (number | null)[]]);
      const created = plot;
      resize = new ResizeObserver(() =>
        created.setSize({ width: Math.max(1, element.clientWidth), height }),
      );
      resize.observe(element);
    });
    return () => {
      cancelled = true;
      resize?.disconnect();
      plot?.destroy();
      chart.current = null;
    };
  }, [color, height, theme]);

  const create = (UPlot: typeof uPlot, element: HTMLDivElement) => {
    const font = `11px ${token("--font-sans") || "IBM Plex Sans"}`;
    const axis = {
      stroke: token("--text-3"),
      font,
      ticks: { show: false },
      gap: 4,
    };
    return new UPlot(
      {
        width: Math.max(1, element.clientWidth),
        height,
        padding: [6, 6, 0, 0],
        legend: { show: false },
        cursor: {
          drag: { x: false, y: false },
          points: { size: 6, fill: token(color), stroke: token(color) },
        },
        scales: {
          x: { time: false },
          // From zero, with some room on top, so a flat line doesn't look alarming.
          y: { range: (_u, _min, max) => [0, max > 0 ? max * 1.2 : 1] },
        },
        axes: [
          {
            ...axis,
            size: 22,
            space: 64,
            grid: { show: false },
            values: (_u, ticks) => ticks.map((t) => formatRef.current.formatTime(t)),
          },
          {
            ...axis,
            size: 40,
            space: 28,
            grid: { stroke: token("--line"), width: 1 },
            // No "0": the baseline is plain, and it would crowd the first time label.
            values: (_u, ticks) => ticks.map((t) => (t === 0 ? "" : formatRef.current.format(t))),
          },
        ],
        series: [
          {},
          { stroke: token(color), width: 1.5, points: { show: false }, spanGaps: false },
        ],
        hooks: {
          setCursor: [
            (u) => {
              const index = u.cursor.idx;
              const x = index == null ? undefined : u.data[0][index];
              const y = index == null ? undefined : u.data[1]?.[index];
              setHovered(
                x == null || y == null
                  ? null
                  : `${formatRef.current.format(y)} at ${formatRef.current.formatTime(x)}`,
              );
            },
          ],
        },
      },
      [[], []],
      element,
    );
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: a chart rebuilt for a new theme needs its data again.
  useEffect(() => {
    chart.current?.setData([time as number[], values as (number | null)[]]);
  }, [time, values, theme]);

  const latest = values.findLast((v) => v !== null);
  return (
    <figure className={cx("m-0", className)}>
      <figcaption className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm text-fg">{title}</span>
        {/* The hovered moment, or the latest value. */}
        <span aria-hidden className="text-xs text-fg-2">
          {hovered ?? (latest == null ? "" : format(latest))}
        </span>
      </figcaption>
      <div ref={container} role="img" aria-label={label} className="w-full" style={{ height }} />
    </figure>
  );
}
