import type { SystemDocument } from "../model/document.ts";
import type { DesignStore } from "../store/design.ts";
import type { SimulationClient } from "./client.ts";
import type { SimulationStore } from "./store.ts";

/** One press of Step advances this much simulated time. */
export const STEP_MS = 1000;
/** Traffic % choices in the top bar. */
export const TRAFFIC_LEVELS = [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10] as const;

/** What the simulation depends on: components, their types and connections. Names and positions don't count. */
function structure(doc: SystemDocument): string {
  return JSON.stringify([
    doc.nodes.map((n) => [n.id, n.type]),
    doc.edges.map((e) => [e.source, e.target]),
  ]);
}

/**
 * Keeps the worker in step with the design and turns run controls into
 * commands. The worker starts on the first Run or Step:
 * - settings changes go live (no reset);
 * - adding or removing components or connections reloads the system
 *   (time back to 0, still running if it was);
 * - opening another system loads it, paused.
 */
export function createSimulationController({
  client,
  design,
  store,
}: {
  client: SimulationClient;
  design: DesignStore;
  store: SimulationStore;
}) {
  let synced: SystemDocument | null = null;

  const load = (doc: SystemDocument) => {
    synced = doc;
    client.send({ type: "load", doc });
  };

  /** Make sure the worker has the current design; returns false if it can't run. */
  const ensureLoaded = () => {
    if (!synced) {
      const { speed, traffic } = store.getState();
      load(design.getState().doc);
      client.send({ type: "setSpeed", speed });
      client.send({ type: "setTraffic", multiplier: traffic });
    }
  };

  design.subscribe((state, previous) => {
    if (!synced || state.doc === previous.doc) return;
    const doc = state.doc;
    if (doc.id !== synced.id) {
      client.send({ type: "pause" });
      store.setState({ runAttempted: false });
      load(doc);
      return;
    }
    if (structure(doc) !== structure(synced)) {
      load(doc);
      return;
    }
    const before = new Map(synced.nodes.map((n) => [n.id, n]));
    for (const node of doc.nodes) {
      if (before.get(node.id)?.params !== node.params) {
        client.send({ type: "updateParams", nodeId: node.id, params: node.params as never });
      }
    }
    synced = doc;
  });

  const play = () => {
    store.setState({ runAttempted: true });
    ensureLoaded();
    client.send({ type: "play" });
  };
  const pause = () => client.send({ type: "pause" });

  return {
    play,
    pause,
    toggle: () => (store.getState().running ? pause() : play()),
    step: () => {
      store.setState({ runAttempted: true });
      ensureLoaded();
      client.send({ type: "step", ms: STEP_MS });
    },
    reset: () => {
      if (synced) client.send({ type: "reset" });
    },
    setSpeed: (speed: number) => {
      store.setState({ speed });
      if (synced) client.send({ type: "setSpeed", speed });
    },
    setTraffic: (multiplier: number) => {
      store.setState({ traffic: multiplier });
      if (synced) client.send({ type: "setTraffic", multiplier });
    },
    takeDown: (nodeId: string) => {
      if (synced) client.send({ type: "takeDown", nodeId });
    },
    bringBack: (nodeId: string) => {
      if (synced) client.send({ type: "bringBack", nodeId });
    },
    /** Hide the problems popover until the next Run. */
    dismissProblems: () => store.setState({ runAttempted: false }),
  };
}

export type SimulationController = ReturnType<typeof createSimulationController>;
