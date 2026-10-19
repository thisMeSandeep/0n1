import { z } from "zod";
import { eventTarget, scenarioSchema } from "./scenario.ts";

/**
 * The system document: one user's design, as plain data. It is what the
 * canvas edits, what IndexedDB stores, what backups contain and what the
 * engine runs. Bump CURRENT_SCHEMA_VERSION and add a migration (migrate.ts)
 * whenever its shape changes.
 */
export const CURRENT_SCHEMA_VERSION = 1;

const id = z.string().min(1);

export const positionSchema = z.object({ x: z.number(), y: z.number() });

export const nodeSchema = z.object({
  id,
  /** Component type id from the registry, e.g. "load-balancer". */
  type: id,
  name: z.string().min(1).max(80),
  position: positionSchema,
  /** Validated against the component's own parameter schema, not here. */
  params: z.record(z.string(), z.unknown()),
});

export const edgeSchema = z.object({
  id,
  /** Node that sends requests. */
  source: id,
  /** Node that receives them. */
  target: id,
});

/** Runs use this seed unless the system says otherwise (M08), as every run did before. */
export const DEFAULT_SEED = 1;
/** Seeds are whole numbers up to this, short enough to read out and share. */
export const MAX_SEED = 999_999;

/** The longest a note's text may be. */
export const NOTE_MAX_LENGTH = 2000;

/** A sticky note on the canvas (M04): words for people, ignored by the simulation. */
export const noteSchema = z.object({
  id,
  text: z.string().max(NOTE_MAX_LENGTH),
  position: positionSchema,
});

export const systemDocumentSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id,
    name: z.string().min(1).max(80),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    meta: z.object({
      /** Unix epoch milliseconds. */
      createdAt: z.number().int().nonnegative(),
      updatedAt: z.number().int().nonnegative(),
    }),
    /**
     * The blueprint this system was made from, if any, for its suggested
     * experiments. Optional, so adding it needed no schema version bump.
     */
    blueprint: z.object({ id }).optional(),
    /** The chaos timeline (S40), also optional. */
    scenario: scenarioSchema.optional(),
    /** Sticky notes (M04), also optional. */
    notes: z.array(noteSchema).optional(),
    /**
     * The run's random seed (M08): the same seed replays the same run.
     * Optional; without it, DEFAULT_SEED.
     */
    seed: z.number().int().min(1).max(MAX_SEED).optional(),
  })
  .superRefine((doc, ctx) => {
    const nodeIds = new Set<string>();
    doc.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", index, "id"],
          message: `Duplicate node id "${node.id}"`,
        });
      }
      nodeIds.add(node.id);
    });
    // Notes share the canvas (and the selection) with components, so their ids can't clash.
    // (They're kept out of nodeIds: nothing connects to a note.)
    const canvasIds = new Set(nodeIds);
    doc.notes?.forEach((note, index) => {
      if (canvasIds.has(note.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["notes", index, "id"],
          message: `Duplicate id "${note.id}"`,
        });
      }
      canvasIds.add(note.id);
    });

    const edgeIds = new Set<string>();
    const links = new Set<string>();
    doc.edges.forEach((edge, index) => {
      const path = ["edges", index];
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "id"],
          message: `Duplicate edge id "${edge.id}"`,
        });
      }
      edgeIds.add(edge.id);

      for (const end of ["source", "target"] as const) {
        if (!nodeIds.has(edge[end])) {
          ctx.addIssue({
            code: "custom",
            path: [...path, end],
            message: `Unknown node "${edge[end]}"`,
          });
        }
      }
      if (edge.source === edge.target) {
        ctx.addIssue({ code: "custom", path, message: "A component can't connect to itself" });
      }
      const link = `${edge.source}→${edge.target}`;
      if (links.has(link)) {
        ctx.addIssue({ code: "custom", path, message: `Duplicate connection ${link}` });
      }
      links.add(link);
    });

    doc.scenario?.events.forEach((event, index) => {
      const target = eventTarget(event);
      if (!target) return;
      const [kind, targetId, known] =
        "node" in target
          ? ["node", target.node, nodeIds.has(target.node)]
          : ["connection", target.edge, edgeIds.has(target.edge)];
      if (!known) {
        ctx.addIssue({
          code: "custom",
          path: ["scenario", "events", index, "target"],
          message: `Unknown ${kind} "${targetId}"`,
        });
      }
    });
  });

export type Position = z.infer<typeof positionSchema>;
export type SystemNode = z.infer<typeof nodeSchema>;
export type SystemNote = z.infer<typeof noteSchema>;
export type SystemEdge = z.infer<typeof edgeSchema>;
export type SystemDocument = z.infer<typeof systemDocumentSchema>;

export const DEFAULT_SYSTEM_NAME = "Untitled system";

/** A new, empty system. `id` and `now` are injectable for tests. */
export function createSystemDocument({
  name = DEFAULT_SYSTEM_NAME,
  id = crypto.randomUUID(),
  now = Date.now(),
}: {
  name?: string;
  id?: string;
  now?: number;
} = {}): SystemDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    name,
    nodes: [],
    edges: [],
    meta: { createdAt: now, updatedAt: now },
  };
}
