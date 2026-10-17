import { z } from "zod";
import { paramsSchema } from "../model/component.ts";
import { edgeSchema, nodeSchema, type SystemDocument } from "../model/document.ts";
import { migrate } from "../model/migrate.ts";
import type { Registry } from "../model/registry.ts";

/*
 * A blueprint is a pre-designed system shipped with 0n1, as one JSON file in
 * src/blueprints/catalog/. It holds a system (components and connections,
 * in the system document's format) plus a title, a description, and
 * suggested experiments. Opening one always makes a copy in the library.
 */

export const BLUEPRINT_FORMAT = "0n1-blueprint";
export const BLUEPRINT_VERSION = 1;

export const blueprintSchema = z.object({
  format: z.literal(BLUEPRINT_FORMAT),
  version: z.literal(BLUEPRINT_VERSION),
  /** Stable, kebab-case, the same as the file name. Never rename: copies remember it. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use kebab-case, e.g. url-shortener"),
  title: z.string().min(1).max(60),
  /** One line for lists: what kind of system, and what it teaches. */
  summary: z.string().min(1).max(120),
  /** A short paragraph shown with the system. */
  description: z.string().min(1),
  /** Things to try, in order, as plain sentences. */
  experiments: z.array(z.string().min(1)).min(1),
  /** Lower comes first in lists; ties sort by title. */
  order: z.number().int().optional(),
  system: z.object({
    schemaVersion: z.number().int().positive(),
    /** Settings may be partial: missing ones take the component's defaults. */
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
  }),
});

export type Blueprint = z.infer<typeof blueprintSchema>;

export class BlueprintError extends Error {
  override name = "BlueprintError";
}

/** Turn a zod issue into "at system.nodes.2.type: …". */
function describe(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return "unknown error";
  const where = issue.path.length > 0 ? ` at ${issue.path.join(".")}` : "";
  return `${issue.message}${where}`;
}

/**
 * Read and check a blueprint file: its shape, its system (migrated to the
 * current schema), and every component's type and settings.
 */
export function parseBlueprint(raw: unknown, registry: Registry): Blueprint {
  const result = blueprintSchema.safeParse(raw);
  if (!result.success)
    throw new BlueprintError(`Invalid blueprint: ${describe(result.error.issues[0])}`);
  const blueprint = result.data;
  const label = `Blueprint "${blueprint.id}"`;

  let doc: SystemDocument;
  try {
    doc = toDocument(blueprint, registry, { id: blueprint.id, name: blueprint.title, now: 0 });
  } catch (error) {
    throw new BlueprintError(`${label}: ${(error as Error).message}`);
  }
  if (doc.nodes.length === 0) throw new BlueprintError(`${label} has no components`);
  return blueprint;
}

function toDocument(
  blueprint: Blueprint,
  registry: Registry,
  { id, name, now }: { id: string; name: string; now: number },
): SystemDocument {
  // A deep copy: nothing done to the new system can reach the shipped blueprint.
  const { schemaVersion, nodes, edges } = structuredClone(blueprint.system);
  const doc = migrate({
    schemaVersion,
    id,
    name,
    nodes,
    edges,
    meta: { createdAt: now, updatedAt: now },
    blueprint: { id: blueprint.id },
  });
  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      const definition = registry.get(node.type);
      if (!definition) throw new Error(`${node.name}: unknown component type "${node.type}"`);
      const params = paramsSchema(definition).safeParse(node.params);
      if (!params.success) {
        throw new Error(`${node.name}: ${describe(params.error.issues[0])}`);
      }
      return { ...node, params: params.data as SystemDocument["nodes"][number]["params"] };
    }),
  };
}

/** A new system made from a blueprint: its own id and name, every setting filled in. */
export function blueprintDocument(
  blueprint: Blueprint,
  registry: Registry,
  options: { id: string; name: string; now: number },
): SystemDocument {
  return toDocument(blueprint, registry, options);
}

/** Sort for lists: by `order`, then title. */
export function compareBlueprints(a: Blueprint, b: Blueprint): number {
  const order = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
  return order !== 0 ? order : a.title.localeCompare(b.title);
}
