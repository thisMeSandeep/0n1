import { registry } from "../components/index.ts";
import { defaultParams } from "../model/component.ts";
import { createSystemDocument, type SystemDocument } from "../model/document.ts";
import { compile } from "./compile.ts";
import { Engine, type EngineOptions } from "./runtime/engine.ts";

/*
 * Test helpers: describe a system compactly and get a running engine.
 * Only imported by tests.
 */

export type NodeSpec = { type: string; name?: string; params?: Record<string, unknown> };

export function systemDocument(
  nodes: Record<string, NodeSpec>,
  edges: readonly (readonly [string, string])[],
): SystemDocument {
  return {
    ...createSystemDocument({ id: "test", now: 0 }),
    nodes: Object.entries(nodes).map(([id, spec]) => ({
      id,
      type: spec.type,
      name: spec.name ?? id,
      position: { x: 0, y: 0 },
      params: { ...defaultParams(registry.require(spec.type)), ...spec.params },
    })),
    edges: edges.map(([source, target]) => ({ id: `${source}->${target}`, source, target })),
  };
}

/** Compile and start an engine; throws with the compile errors if it can't run. */
export function runningSystem(
  nodes: Record<string, NodeSpec>,
  edges: readonly (readonly [string, string])[],
  options: EngineOptions = {},
): Engine {
  const { model, errors } = compile(systemDocument(nodes, edges), registry);
  if (!model) throw new Error(errors.map((e) => e.message).join("\n"));
  return new Engine(model, options);
}

/** A window covering a whole test run, so totals and averages span it all. */
export const wholeRun = (ms: number) => ({ windowMs: ms * 2, slots: 1 });
