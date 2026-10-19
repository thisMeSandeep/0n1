import { DEFAULT_SEED, type SystemDocument } from "../model/document.ts";
import type { DesignStore } from "../store/design.ts";
import type { SimulationClient } from "./client.ts";
import type { SimulationStore } from "./store.ts";

/** One press of Step advances this much simulated time. */
export const STEP_MS = 1000;
/** Traffic % choices in the top bar. */
export const TRAFFIC_LEVELS = [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10] as const;

/**
 * What the simulation is built from: components, their types, connections,
 * the chaos timeline (events are scheduled when the run starts) and the
 * random seed (M08). Names and positions don't count.
 */
function structure(doc: SystemDocument): string {
  return JSON.stringify([
    doc.nodes.map((n) => [n.id, n.type]),
    doc.edges.map((e) => [e.id, e.source, e.target]),
    doc.scenario?.events ?? [],
    doc.seed ?? DEFAULT_SEED,
  ]);
}

/**
 * Keeps the worker in step with the design and turns run controls into
 * commands. The worker starts on the first Run or Step:
 * - settings changes go live (no reset);
 * - adding or removing components or connections, or changing the chaos
 *   timeline or the seed, reloads the system (time back to 0, still running
 *   if it was);
 * - opening another system loads it, paused.
 *
 * Components taken down stay down through a reload, until they're brought
 * back, the run is reset, or another system is opened.
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
  const down = new Set<string>();

  const load = (doc: SystemDocument) => {
    synced = doc;
    client.send({ type: "load", doc });
    const present = new Set(doc.nodes.map((n) => n.id));
    for (const nodeId of down) {
      if (present.has(nodeId)) client.send({ type: "takeDown", nodeId });
      else down.delete(nodeId);
    }
  };

  /** Make sure the worker has the current design. */
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
      down.clear();
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

  /** Works before the first Run too: the system loads, paused, with it down. */
  const takeDown = (nodeId: string) => {
    ensureLoaded();
    down.add(nodeId);
    client.send({ type: "takeDown", nodeId });
  };
  const bringBack = (nodeId: string) => {
    down.delete(nodeId);
    if (synced) client.send({ type: "bringBack", nodeId });
  };

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
      down.clear();
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
    takeDown,
    bringBack,
    isDown: (nodeId: string) => down.has(nodeId),
    /** Take them all down, or if they're all down already, bring them back (K). */
    toggleDown: (nodeIds: readonly string[]) => {
      const allDown = nodeIds.length > 0 && nodeIds.every((id) => down.has(id));
      for (const id of nodeIds) {
        if (allDown) bringBack(id);
        else if (!down.has(id)) takeDown(id);
      }
    },
    /**
     * Trace the next request from a client, or any client (S42). It arrives
     * once that request is done; if the system isn't running, once it runs.
     */
    trace: (clientId: string | null = null) => {
      ensureLoaded();
      store.setState((s) => ({ tracesPending: s.tracesPending + 1 }));
      client.send({ type: "trace", clientId });
    },
    /** Hide the problems popover until the next Run. */
    dismissProblems: () => store.setState({ runAttempted: false }),
  };
}

export type SimulationController = ReturnType<typeof createSimulationController>;
