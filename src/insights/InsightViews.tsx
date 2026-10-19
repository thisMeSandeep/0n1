import { LightbulbIcon } from "@phosphor-icons/react";
import { Explain } from "../guide/Explain.tsx";
import { useLive } from "../simulation/index.ts";
import { selectionStore } from "../store/index.ts";
import { cx } from "../ui/cx.ts";
import { LevelMark } from "../ui/LevelMark.tsx";
import type { Insight } from "./rules.ts";

const select = (insight: Insight) => {
  if (insight.nodeId) selectionStore.getState().select({ nodeIds: [insight.nodeId], edgeIds: [] });
};

/**
 * The worst insight as one line above the vitals pill (S41). Clicking it
 * selects the component it's about. Screen readers hear a new title, not
 * every change in the numbers.
 */
export function InsightNote() {
  const insights = useLive((s) => s.insights);
  const worst = insights[0];
  return (
    <>
      <span className="sr-only" aria-live="polite">
        {worst?.title ?? ""}
      </span>
      {worst && (
        <button
          type="button"
          data-insight-note
          onClick={() => select(worst)}
          className={cx(
            "flex max-w-[min(40rem,calc(100vw-48rem))] min-w-0 items-center gap-2 rounded-pill border bg-raised px-3.5 py-1.5",
            "text-sm shadow-raised transition-colors duration-(--duration-fast) hover:border-line-strong",
            worst.severity === "fail"
              ? "border-[color-mix(in_srgb,var(--fail)_40%,var(--line))]"
              : "border-[color-mix(in_srgb,var(--warn)_40%,var(--line))]",
          )}
        >
          <LevelMark level={worst.severity} className="shrink-0" />
          <span className="min-w-0 truncate">
            <span className="font-medium text-fg">{worst.title}</span>{" "}
            <span className="text-fg-2">{worst.detail}</span>
          </span>
          {insights.length > 1 && (
            <span className="shrink-0 rounded-pill bg-fg/6 px-1.5 text-xs text-fg-2">
              +{insights.length - 1}
            </span>
          )}
        </button>
      )}
    </>
  );
}

/** Every current insight (or those about one component), with its fix. */
export function InsightList({ nodeId, title }: { nodeId?: string; title?: string }) {
  const all = useLive((s) => s.insights);
  const insights = nodeId ? all.filter((i) => i.nodeId === nodeId) : all;
  if (insights.length === 0) return null;
  return (
    <section className="pt-6">
      {title && (
        <h3 className="mb-3 text-sm font-medium text-fg-2">
          <Explain id="insights">{title}</Explain>
        </h3>
      )}
      <ul aria-label="Insights" className="-mx-2 flex flex-col gap-1">
        {insights.map((insight) => (
          <li key={insight.id}>
            <button
              type="button"
              onClick={() => select(insight)}
              disabled={nodeId !== undefined || !insight.nodeId}
              className="flex w-full gap-2.5 rounded-control px-2 py-2 text-left enabled:hover:bg-fg/6"
            >
              <LevelMark level={insight.severity} className="mt-1.5 shrink-0 self-start" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-base font-medium text-fg">{insight.title}</span>
                <span className="text-sm text-fg-2">{insight.detail}</span>
                {insight.fix && (
                  <span className="flex items-start gap-1.5 text-sm text-fg-2">
                    <LightbulbIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <span className="sr-only">What might help: </span>
                      {insight.fix}
                    </span>
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
