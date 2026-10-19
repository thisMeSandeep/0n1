import { describe, expect, it } from "vitest";
import { findBlueprint } from "../blueprints/catalog.ts";
import { blueprintDocument } from "../blueprints/format.ts";
import { registry } from "../components/index.ts";
import { compile } from "../engine/compile.ts";
import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";
import { Engine } from "../engine/runtime/engine.ts";
import type { TraceRecord } from "../engine/runtime/trace.ts";
import type { Params } from "../model/component.ts";
import { createSystemDocument, type Position } from "../model/document.ts";
import { createDesignStore } from "../store/design.ts";
import { whereTimeWent } from "../tracing/waterfall.ts";
import type { Lesson, TutorialContext } from "./lesson.ts";
import { caching } from "./lessons/caching.ts";
import { failures } from "./lessons/failures.ts";
import { firstSystem } from "./lessons/firstSystem.ts";
import { LESSONS } from "./lessons/index.ts";
import { queues } from "./lessons/queues.ts";
import { traces } from "./lessons/traces.ts";

describe("lessons", () => {
  it("have unique ids, a known start, and steps with unique ids and something to say", () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const lesson of LESSONS) {
      if ("blueprint" in lesson.start) expect(findBlueprint(lesson.start.blueprint)).toBeDefined();
      const ids = lesson.steps.map((s) => s.id);
      expect(new Set(ids).size, lesson.id).toBe(ids.length);
      for (const step of lesson.steps) expect(step.body.length, step.id).toBeGreaterThan(0);
    }
  });
});

/**
 * A learner's session, as the app would run it: the design, and an engine
 * that's rebuilt (keeping the traffic) whenever components or connections
 * change, as the lab does.
 */
function session(lesson: Lesson) {
  const doc =
    "blueprint" in lesson.start
      ? blueprintDocument(findBlueprint(lesson.start.blueprint)!, registry, {
          id: "t",
          name: "t",
          now: 0,
        })
      : createSystemDocument({ id: "t", now: 0 });
  const design = createDesignStore({ registry, doc });
  let engine: Engine | null = null;
  let built = "";
  let traffic = 1;
  let snapshot: MetricsSnapshot | null = null;
  let selected: string[] = [];
  let openTrace: TraceRecord | null = null;
  const structure = () => {
    const d = design.getState().doc;
    return JSON.stringify([d.nodes.map((n) => [n.id, n.type]), d.edges]);
  };
  const start = () => {
    built = structure();
    engine = new Engine(compile(design.getState().doc, registry).model!);
    engine.setTrafficMultiplier(traffic);
    snapshot = engine.snapshot();
  };
  /** Like the lab: a changed structure reloads the run, from 0, at the same traffic. */
  const sync = () => {
    if (engine && structure() !== built) start();
  };
  const tick = (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      engine!.runUntil(engine!.sim.now + 1000);
      snapshot = engine!.snapshot();
    }
  };
  const id = (type: string) => design.getState().doc.nodes.find((n) => n.type === type)!.id;
  return {
    id,
    node: (nodeId: string) => snapshot!.nodes[nodeId]!,
    snapshot: () => snapshot!,
    context: (): TutorialContext => ({
      doc: design.getState().doc,
      snapshot,
      running: engine !== null,
      traffic,
      selected,
      openTrace,
    }),
    add: (type: string, at: Position = { x: 0, y: 0 }) => {
      design.getState().addNode(type, at);
      sync();
    },
    connect: (source: string, target: string) => {
      design.getState().connect(source, target);
      sync();
    },
    run: start,
    tick,
    traffic: (multiplier: number) => {
      traffic = multiplier;
      engine?.setTrafficMultiplier(multiplier);
    },
    select: (ids: string[]) => {
      selected = ids;
    },
    set: (nodeId: string, params: Params) => {
      design.getState().updateParams(nodeId, params);
      engine?.updateParams(nodeId, params);
    },
    takeDown: (nodeId: string) => {
      engine!.takeDown(nodeId);
      tick(1);
    },
    bringBack: (nodeId: string) => {
      engine!.bringBack(nodeId);
      tick(1);
    },
    /** Trace a request a learner asked for; it opens once it's done. */
    trace: () => {
      let record: TraceRecord | null = null;
      engine!.onTrace = (t) => {
        if (t.reason === "asked") record = t;
      };
      engine!.traceNext(null);
      for (let i = 0; i < 40 && !record; i++) {
        engine!.runUntil(engine!.sim.now + 250);
        snapshot = engine!.snapshot();
      }
      openTrace = record;
    },
    closeTrace: () => {
      openTrace = null;
    },
  };
}

type Session = ReturnType<typeof session>;

/**
 * Play a lesson: for each step with something to do, do it, then give it
 * up to 90 simulated seconds (steps that wait for the system to react).
 * Each must not be done before, and must be done after.
 */
function play(lesson: Lesson, actions: Record<string, (s: Session) => void>) {
  const s = session(lesson);
  for (const step of lesson.steps) {
    if (!step.done) {
      actions[step.id]?.(s);
      continue;
    }
    expect(step.done(s.context()), `${step.id}: done before doing it`).toBe(false);
    actions[step.id]?.(s);
    for (let i = 0; i < 90 && !step.done(s.context()) && s.context().running; i++) s.tick(1);
    expect(step.done(s.context()), `${step.id}: not done after doing it`).toBe(true);
  }
  const unknown = Object.keys(actions).filter((id) => !lesson.steps.some((st) => st.id === id));
  expect(unknown, "actions for steps that don't exist").toEqual([]);
}

/** p99 as users see it right now. */
const p99 = (s: Session) => s.snapshot().system.latency?.p99 ?? 0;

describe("each lesson can be done step by step, and says what really happens", () => {
  it("Your first system", () => {
    play(firstSystem, {
      "add-client": (s) => s.add("client"),
      "add-service": (s) => s.add("service", { x: 300, y: 0 }),
      connect: (s) => s.connect(s.id("client"), s.id("service")),
      run: (s) => {
        s.run();
        s.tick(10);
        // "about 100", "around 100 ms", "about 11%"
        expect(s.snapshot().system.throughput).toBeGreaterThan(85);
        expect(s.snapshot().system.throughput).toBeLessThan(115);
        expect(p99(s)).toBeGreaterThan(40);
        expect(p99(s)).toBeLessThan(150);
        expect(s.node(s.id("service")).utilization).toBeGreaterThan(0.08);
        expect(s.node(s.id("service")).utilization).toBeLessThan(0.15);
      },
      "select-service": (s) => s.select([s.id("service")]),
      push: (s) => s.set(s.id("client"), { rate: 1000 }),
      fix: (s) => {
        // "Slow became failed": nearly every request fails.
        s.tick(5);
        expect(s.snapshot().system.errorRate).toBeGreaterThan(0.9);
        s.set(s.id("service"), { concurrency: 64 });
      },
      cost: (s) => {
        // "Busy settles around 30%"
        expect(s.node(s.id("service")).utilization).toBeGreaterThan(0.2);
        expect(s.node(s.id("service")).utilization).toBeLessThan(0.4);
      },
    });
  });

  it("Caching", () => {
    play(caching, {
      run: (s) => s.run(),
      "select-db": (s) => {
        s.tick(10);
        s.select(["db"]);
        // "about 26% busy"
        expect(s.node("db").utilization).toBeGreaterThan(0.2);
        expect(s.node("db").utilization).toBeLessThan(0.32);
      },
      traffic: (s) => s.traffic(5),
      "add-cache": (s) => {
        // "About 240 requests wait"
        expect(s.node("db").waiting).toBeGreaterThan(180);
        expect(s.node("db").waiting).toBeLessThan(310);
        s.add("cache");
      },
      "connect-cache": (s) => {
        s.connect("api-1", s.id("cache"));
        s.connect("api-2", s.id("cache"));
      },
      "select-cache": (s) => {
        // "p99 is down to about 60 ms"
        expect(p99(s)).toBeLessThan(120);
        s.select([s.id("cache")]);
        s.tick(15);
        // "climbs past 60%", "back to about 60% busy"
        expect(s.node(s.id("cache")).hitRatio).toBeGreaterThan(0.55);
        expect(s.node("db").utilization).toBeLessThan(0.75);
      },
      uniform: (s) => s.set("users", { keyPopularity: "uniform" }),
      done: (s) => {
        // "falls to about 10%"
        expect(s.node(s.id("cache")).hitRatio).toBeLessThan(0.2);
      },
    });
  });

  it("Queues", () => {
    play(queues, {
      run: (s) => s.run(),
      traffic: (s) => s.traffic(2),
      "add-queue": (s) => s.add("queue"),
      "add-worker": (s) => s.add("worker"),
      wire: (s) => {
        const q = s.id("queue");
        const w = s.id("worker");
        s.connect("api-1", q);
        s.connect("api-2", q);
        s.connect(q, w);
        s.connect(w, "primary");
      },
      pace: (s) => s.set(s.id("worker"), { concurrency: 7, workTime: 1 }),
      "select-queue": (s) => {
        // "p99 is about 35 ms"
        expect(p99(s)).toBeLessThan(80);
        s.select([s.id("queue")]);
      },
      backlog: (s) => {
        // "by about 180 jobs a second"
        const before = s.node(s.id("queue")).waiting;
        s.tick(5);
        const perSecond = (s.node(s.id("queue")).waiting - before) / 5;
        expect(perSecond).toBeGreaterThan(120);
        expect(perSecond).toBeLessThan(240);
      },
      calm: (s) => s.traffic(1),
    });
  });

  it("When a part fails", () => {
    play(failures, {
      run: (s) => {
        s.run();
        s.tick(5);
      },
      "down-api": (s) => s.takeDown("api-1"),
      "down-db": (s) => {
        // "A handful of requests fail, and that's all."
        s.tick(5);
        expect(s.snapshot().system.errorRate).toBeLessThan(0.02);
        s.takeDown("db");
      },
      "back-db": (s) => s.bringBack("db"),
    });
  });

  it("Reading a trace", () => {
    play(traces, {
      run: (s) => {
        s.run();
        s.tick(5);
      },
      trace: (s) => s.trace(),
      read: (s) => {
        // "a few tens of milliseconds, mostly at Links DB"
        const t = s.context().openTrace!;
        expect(t.finishedAt - t.startedAt).toBeLessThan(80);
      },
      load: (s) => {
        s.closeTrace();
        s.traffic(4);
      },
      "trace-again": (s) => s.trace(),
      waiting: (s) => {
        // "nearly all of it is waiting at Links DB"
        const top = whereTimeWent(s.context().openTrace!)[0]!;
        expect(top.node).toBe("db");
        expect(top.waited).toBeGreaterThan(top.worked);
      },
    });
  });
});
