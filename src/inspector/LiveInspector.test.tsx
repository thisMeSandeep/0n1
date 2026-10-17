// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { VitalsPill } from "../canvas/VitalsPill.tsx";
import { registry } from "../components/index.ts";
import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";
import { runningSystem, systemDocument } from "../engine/testing.ts";
import {
  formatCompact,
  formatDuration,
  formatPercent,
  type Measure,
} from "../simulation/format.ts";
import { live } from "../simulation/index.ts";
import { EMPTY_LIVE, nextLiveState } from "../simulation/live.ts";
import { designStore, selectionStore } from "../store/index.ts";
import { TooltipProvider } from "../ui/Tooltip.tsx";
import { Inspector } from "./Inspector.tsx";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const nodes = {
  users: { type: "client", params: { rate: 300, retries: 0, timeout: 2000 } },
  api: { type: "service", params: { concurrency: 8, workTime: 20, maxWaiting: 100 } },
  cache: { type: "cache" },
  db: { type: "database", params: { errorRate: 5 } },
} as const;
const edges = [
  ["users", "api"],
  ["api", "cache"],
  ["api", "db"],
] as const;

let snapshot: MetricsSnapshot;

beforeEach(() => {
  const engine = runningSystem(nodes, edges);
  engine.runUntil(8000);
  snapshot = engine.snapshot();
  const doc = systemDocument(nodes, edges);
  designStore.getState().load(doc);
  selectionStore.getState().clear();
  live.setState(
    nextLiveState(
      EMPTY_LIVE,
      null,
      snapshot,
      (id) => registry.get(doc.nodes.find((n) => n.id === id)?.type ?? "")?.liveDetail ?? "p99",
      doc.edges,
    ),
    true,
  );
});
afterEach(() => {
  cleanup();
  live.setState(EMPTY_LIVE, true);
});

const text = (measure: Measure | null) => (measure ? `${measure.value}${measure.unit}` : "—");
const stat = (label: string) =>
  within(screen.getByRole("region", { name: "Live summary" })).getByText(
    (_, element) => element?.getAttribute("data-stat") === label,
  ).textContent;

function renderInspector() {
  render(
    <TooltipProvider>
      <Inspector onClose={() => {}} />
    </TooltipProvider>,
  );
}

describe("live numbers in the inspector match the engine's snapshot", () => {
  it("a component's live summary and details", async () => {
    const api = snapshot.nodes.api;
    if (!api?.latency) throw new Error("no api metrics");
    act(() => selectionStore.getState().select({ nodeIds: ["api"], edgeIds: [] }));
    renderInspector();

    expect(stat("Throughput")).toBe(`${formatCompact(api.throughput)}/s`);
    expect(stat("p99")).toBe(text(formatDuration(api.latency.p99)));
    expect(stat("Busy")).toBe(text(formatPercent(api.utilization)));

    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    const row = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    const spaced = (m: Measure) => `${m.value} ${m.unit}`;
    expect(row("In flight")).toBe(formatCompact(api.inFlight));
    expect(row("Arriving")).toBe(`${formatCompact(api.arrivals)}/s`);
    expect(row("p50")).toBe(spaced(formatDuration(api.latency.p50)));
    expect(row("p95")).toBe(spaced(formatDuration(api.latency.p95)));
    expect(row("Failed responses")).toBe(spaced(formatPercent(api.errorRate)));
    expect(row("Total arrived")).toBe(formatCompact(api.totals.arrived));
  });

  it("a cache shows its hit ratio", () => {
    const cache = snapshot.nodes.cache;
    act(() => selectionStore.getState().select({ nodeIds: ["cache"], edgeIds: [] }));
    renderInspector();
    expect(stat("Hit ratio")).toBe(text(formatPercent(cache?.hitRatio ?? 0)));
  });

  it("a connection's rate, round trip and errors", () => {
    const edge = snapshot.edges["api→db"];
    const id = designStore.getState().doc.edges.find((e) => e.target === "db")?.id as string;
    act(() => selectionStore.getState().select({ nodeIds: [], edgeIds: [id] }));
    renderInspector();
    expect(stat("Rate")).toBe(`${formatCompact(edge?.rate ?? 0)}/s`);
    expect(stat("p99 round trip")).toBe(text(formatDuration(edge?.latency?.p99 ?? 0)));
    expect(stat("Errors")).toBe(text(formatPercent(edge?.errorRate ?? 0)));
    expect(edge?.errorRate).toBeGreaterThan(0.01); // the database's error rate shows up here
  });

  it("the system view: health and traffic per client", () => {
    renderInspector();
    const users = snapshot.nodes.users;
    const traffic = within(screen.getByRole("region", { name: "Traffic from users" }));
    const value = (label: string) =>
      traffic.getByText((_, element) => element?.getAttribute("data-stat") === label).textContent;
    expect(value("Sent")).toBe(`${formatCompact(users?.arrivals ?? 0)}/s`);
    expect(value("Errors")).toBe(text(formatPercent(users?.errorRate ?? 0)));
    // The database fails 5% of its queries: it needs attention.
    const attention = screen.getByRole("list", { name: "Needs attention" });
    expect(within(attention).getByText("db")).toBeTruthy();
  });
});

describe("the vitals pill", () => {
  it("shows the system's throughput, p99 and errors", () => {
    render(<VitalsPill />);
    const vital = (name: string) => document.querySelector(`[data-vital="${name}"]`)?.textContent;
    const { system } = snapshot;
    expect(vital("throughput")).toBe(`${formatCompact(system.throughput)}/s`);
    expect(vital("p99")).toBe(text(formatDuration(system.latency?.p99 ?? 0)));
    expect(vital("errors")).toBe(text(formatPercent(system.errorRate)));
  });

  it("shows dashes before a run", () => {
    live.setState(EMPTY_LIVE, true);
    render(<VitalsPill />);
    expect(document.querySelector('[data-vital="throughput"]')?.textContent).toBe("—");
  });
});
