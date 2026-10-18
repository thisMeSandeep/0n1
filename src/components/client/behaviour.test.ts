import { describe, expect, it } from "vitest";
import { compile } from "../../engine/compile.ts";
import { createRng } from "../../engine/core/prng.ts";
import { Simulator } from "../../engine/core/simulator.ts";
import { NodeRecorder, SystemRecorder } from "../../engine/metrics/recorder.ts";
import type { Request } from "../../engine/runtime/types.ts";
import { defaultParams } from "../../model/component.ts";
import { createSystemDocument } from "../../model/document.ts";
import { registry } from "../index.ts";
import { client } from "./behaviour.ts";

/** Run a client against a target that answers instantly; return what it sent. */
function sentBy(params: Record<string, unknown>, durationMs = 100_000) {
  const doc = {
    ...createSystemDocument({ id: "s", now: 0 }),
    nodes: [
      {
        id: "users",
        type: "client",
        name: "Users",
        position: { x: 0, y: 0 },
        params: { ...defaultParams(registry.require("client")), ...params },
      },
      { id: "api", type: "service", name: "API", position: { x: 0, y: 0 }, params: {} },
    ],
    edges: [{ id: "e", source: "users", target: "api" }],
  };
  const node = compile(doc, registry).model!.nodes.get("users")!;
  const sim = new Simulator();
  const sent: Request[] = [];
  let id = 0;
  const behaviour = client({
    sim,
    rng: createRng(1),
    node,
    recorder: new NodeRecorder(),
    system: new SystemRecorder(),
    nextRequestId: () => ++id,
    peer: () => undefined,
    sampling: { weight: () => 1, countRequest: () => {} },
    isUp: () => true,
    traffic: () => 1,
    tracing: { begin: () => undefined },
    send: (_to, request, reply) => {
      sent.push(request);
      reply({ ok: true });
    },
  });
  behaviour.start?.();
  sim.runUntil(durationMs);
  return sent;
}

describe("client traffic", () => {
  it("sends at the configured average rate", () => {
    const sent = sentBy({ rate: 250 });
    expect(Math.abs(sent.length / 100 - 250) / 250).toBeLessThan(0.02);
  });

  it("mixes reads and writes by the read share", () => {
    const sent = sentBy({ rate: 500, readShare: 70 });
    const reads = sent.filter((r) => r.kind === "read").length / sent.length;
    expect(Math.abs(reads - 0.7)).toBeLessThan(0.01);
  });

  it("concentrates traffic on a few keys when they're hot, spreads it when uniform", () => {
    const share = (popularity: string) => {
      const sent = sentBy({ rate: 500, keys: 1000, keyPopularity: popularity });
      return sent.filter((r) => r.key < 10).length / sent.length;
    };
    // Zipf(1) over 1000 keys: the top 10 get H₁₀ / H₁₀₀₀ ≈ 39%. Uniform: 1%.
    expect(Math.abs(share("hot") - 0.39)).toBeLessThan(0.02);
    expect(Math.abs(share("uniform") - 0.01)).toBeLessThan(0.005);
  });

  it("keeps keys inside the key space", () => {
    expect(sentBy({ rate: 100, keys: 7 }).every((r) => r.key >= 0 && r.key < 7)).toBe(true);
  });
});
