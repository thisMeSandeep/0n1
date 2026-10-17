// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { type NodeProps, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { Profiler } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NodeMetrics } from "../engine/metrics/recorder.ts";
import { live } from "../simulation/index.ts";
import { nextLiveState } from "../simulation/live.ts";
import { TooltipProvider } from "../ui/Tooltip.tsx";
import { ComponentNode, zoomLevel } from "./ComponentNode.tsx";
import type { ComponentFlowNode } from "./flow.ts";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const metrics = (patch: Partial<NodeMetrics> = {}): NodeMetrics => ({
  arrivals: 100,
  throughput: 100,
  errorRate: 0,
  drops: 0,
  failures: 0,
  latency: { mean: 10, p50: 8, p95: 20, p99: 42 },
  utilization: 0.3,
  inFlight: 3,
  waiting: 0,
  totals: { arrived: 0, completed: 0, failed: 0, dropped: 0 },
  ...patch,
});

/** Feed the live store a snapshot, as the simulation would. */
function publish(time: number, nodes: Record<string, NodeMetrics>) {
  const state = live.getState();
  act(() => {
    live.setState(
      nextLiveState(
        state,
        state.started ? time - 250 : null,
        {
          time,
          sampling: { weight: 1 },
          system: { goodput: 0, throughput: 0, errorRate: 0, latency: null },
          nodes,
          edges: {},
        },
        () => "p99",
      ),
      true,
    );
  });
}

const renders = new Map<string, number>();

function Counted(props: NodeProps<ComponentFlowNode>) {
  return (
    <Profiler id={props.id} onRender={(id) => renders.set(id, (renders.get(id) ?? 0) + 1)}>
      <ComponentNode {...props} />
    </Profiler>
  );
}
const nodeTypes = { component: Counted };

const flowNode = (id: string, name: string, y: number): ComponentFlowNode => ({
  id,
  type: "component",
  position: { x: 0, y },
  data: { name, type: "service", hint: null },
});

function renderCanvas() {
  return render(
    <TooltipProvider>
      <ReactFlowProvider>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlow
            nodes={[flowNode("a", "API A", 0), flowNode("b", "API B", 200)]}
            edges={[]}
            nodeTypes={nodeTypes}
          />
        </div>
      </ReactFlowProvider>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  live.setState({ started: false, nodes: {}, edges: {}, trends: {} }, true);
  renders.clear();
});
afterEach(cleanup);

describe("a component on the canvas", () => {
  it("shows its type until a run starts, then its numbers", () => {
    renderCanvas();
    expect(screen.getAllByText("Service")).toHaveLength(2);
    publish(0, { a: metrics({ throughput: 1480 }), b: metrics() });
    expect(screen.getByText("1.48k")).toBeTruthy();
    expect(screen.queryByText("Service")).toBeNull();
  });

  it("re-renders only when its own numbers change", () => {
    renderCanvas();
    publish(0, { a: metrics(), b: metrics() });
    const before = { a: renders.get("a") ?? 0, b: renders.get("b") ?? 0 };

    publish(250, { a: metrics({ throughput: 700 }), b: metrics({ throughput: 100.1 }) });
    expect(renders.get("a")).toBe(before.a + 1);
    expect(renders.get("b")).toBe(before.b); // still shows "100"

    publish(500, { a: metrics({ throughput: 700 }), b: metrics({ utilization: 0.85 }) });
    expect(renders.get("a")).toBe(before.a + 1);
    expect(renders.get("b")).toBe(before.b + 1);
  });

  it("marks its state: busy, failing with an error badge, and down", () => {
    const { container } = renderCanvas();
    const card = (name: string) =>
      [...container.querySelectorAll("[data-card]")].find((c) => c.textContent?.includes(name));

    publish(0, {
      a: metrics({ utilization: 0.82 }),
      b: metrics({ throughput: 90, drops: 10, failures: 10 }),
    });
    expect(card("API A")?.getAttribute("data-status")).toBe("busy");
    expect(card("API B")?.getAttribute("data-status")).toBe("failing");
    expect(screen.getByText(/10% errors/)).toBeTruthy();

    publish(250, { a: metrics({ down: true, downSince: 112_000 }), b: metrics() });
    expect(card("API A")?.getAttribute("data-status")).toBe("down");
    expect(screen.getByText("Down since 01:52")).toBeTruthy();
  });
});

describe("semantic zoom", () => {
  it("has three levels", () => {
    expect(zoomLevel(0.3)).toBe("far");
    expect(zoomLevel(1)).toBe("normal");
    expect(zoomLevel(1.5)).toBe("near");
  });
});
