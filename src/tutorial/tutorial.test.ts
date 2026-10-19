import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import { compile } from "../engine/compile.ts";
import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";
import { Engine } from "../engine/runtime/engine.ts";
import { createSystemDocument } from "../model/document.ts";
import { createDesignStore } from "../store/design.ts";
import type { TutorialContext } from "./lesson.ts";
import { firstSystem, LESSONS } from "./lessons/firstSystem.ts";

describe("lessons", () => {
  it("have unique ids, and steps with unique ids and something to say", () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const lesson of LESSONS) {
      const ids = lesson.steps.map((s) => s.id);
      expect(new Set(ids).size, lesson.id).toBe(ids.length);
      for (const step of lesson.steps) expect(step.body.length, step.id).toBeGreaterThan(0);
    }
  });
});

/**
 * Play "Your first system" as a learner would: do what each step asks, and
 * check the step sees it done, and that the numbers it quotes hold.
 */
describe("Your first system", () => {
  it("can be done step by step, and says what really happens", () => {
    const design = createDesignStore({ registry, doc: createSystemDocument({ id: "t", now: 0 }) });
    const actions = design.getState();
    let engine: Engine | null = null;
    let running = false;
    let selected: string[] = [];
    let snapshot: MetricsSnapshot | null = null;
    const context = (): TutorialContext => ({
      doc: design.getState().doc,
      snapshot,
      running,
      selected,
    });
    const node = (type: string) => design.getState().doc.nodes.find((n) => n.type === type);
    /** Run until `until` holds (checking each second), at most `seconds`. */
    const runUntil = (until: () => boolean, seconds: number) => {
      const e = engine as Engine;
      for (let i = 0; i < seconds && !until(); i++) {
        e.runUntil(e.sim.now + 1000);
        snapshot = e.snapshot();
      }
    };

    /** What a learner does at each step that asks for something. */
    const DO: Record<string, () => void> = {
      "add-client": () => actions.addNode("client", { x: 0, y: 0 }),
      "add-service": () => actions.addNode("service", { x: 300, y: 0 }),
      connect: () => actions.connect(node("client")!.id, node("service")!.id),
      run: () => {
        const { model } = compile(design.getState().doc, registry);
        engine = new Engine(model!);
        running = true;
        runUntil(() => false, 10);
        // What the next steps say about it.
        expect(snapshot!.system.throughput).toBeGreaterThan(85);
        expect(snapshot!.system.throughput).toBeLessThan(115);
        // "around 100 ms"
        expect(snapshot!.system.latency!.p99).toBeGreaterThan(40);
        expect(snapshot!.system.latency!.p99).toBeLessThan(150);
        const busy = snapshot!.nodes[node("service")!.id]!.utilization;
        expect(busy).toBeGreaterThan(0.08);
        expect(busy).toBeLessThan(0.15);
      },
      "select-service": () => {
        selected = [node("service")!.id];
      },
      push: () => {
        actions.updateParams(node("client")!.id, { rate: 1000 });
        engine!.updateParams(node("client")!.id, { rate: 1000 });
      },
      // Waiting for the errors: "a few seconds".
      break: () => runUntil(() => (snapshot?.system.errorRate ?? 0) >= 0.5, 15),
      fix: () => {
        // "Slow became failed": a few seconds on, nearly every request fails.
        runUntil(() => false, 5);
        expect(snapshot!.system.errorRate).toBeGreaterThan(0.9);
        actions.updateParams(node("service")!.id, { concurrency: 64 });
        engine!.updateParams(node("service")!.id, { concurrency: 64 });
      },
      recover: () => {
        runUntil(() => firstSystem.steps.find((s) => s.id === "recover")!.done!(context()), 15);
        // "Busy settles around 30%".
        const busy = snapshot!.nodes[node("service")!.id]!.utilization;
        expect(busy).toBeGreaterThan(0.2);
        expect(busy).toBeLessThan(0.4);
      },
    };

    for (const step of firstSystem.steps) {
      if (!step.done) continue;
      expect(step.done(context()), `${step.id}: done before doing it`).toBe(false);
      const act = DO[step.id];
      expect(act, `${step.id}: nothing scripted for it`).toBeDefined();
      act?.();
      expect(step.done(context()), `${step.id}: not done after doing it`).toBe(true);
    }
    // Every scripted action belongs to a step.
    expect(Object.keys(DO).filter((id) => !firstSystem.steps.some((s) => s.id === id))).toEqual([]);
  });
});
