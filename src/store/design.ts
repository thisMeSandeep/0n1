import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import { canConnect, defaultParams, type Params, paramsSchema } from "../model/component.ts";
import { checkConnection } from "../model/connections.ts";
import {
  DEFAULT_SEED,
  MAX_SEED,
  NOTE_MAX_LENGTH,
  type Position,
  type SystemDocument,
  type SystemNode,
} from "../model/document.ts";
import type { Registry } from "../model/registry.ts";
import { eventTarget, type NewScenarioEvent, scenarioEventSchema } from "../model/scenario.ts";

/**
 * The design store: the one place the current system document is edited.
 * Every change to `doc` is one undo step, except gestures (dragging nodes or
 * a slider), which are grouped into a single step between `beginGesture`
 * and `endGesture`.
 */

export type ConnectResult = { ok: true; edgeId: string } | { ok: false; reason: string };

export type DesignActions = {
  /** Replace the document (e.g. opening another system). Clears history. */
  load(doc: SystemDocument): void;
  renameSystem(name: string): boolean;
  /** Adds a component with default params and a unique name. Returns its id. */
  addNode(type: string, position: Position): string;
  /** Moves components and notes. */
  moveNodes(moves: readonly { id: string; position: Position }[]): void;
  renameNode(id: string, name: string): boolean;
  /** Show a vendor icon on a component (null: 0n1's own). One undo step. */
  setNodeIcon(id: string, icon: string | null): void;
  /** Merges and validates against the component's schema. Rejects invalid values. */
  updateParams(id: string, patch: Params): boolean;
  /** Every setting of these components back to its default (M05): one undo step. */
  resetParams(ids: readonly string[]): void;
  /** Removes nodes (and every connection touching them) and notes. */
  removeNodes(ids: readonly string[]): void;
  /** The run's random seed (M08). Rejects anything but a whole number from 1 to MAX_SEED. */
  setSeed(seed: number): boolean;
  /** A sticky note (M04) at `position`. Returns its id. */
  addNote(position: Position, text?: string): string;
  /** Rejects text over the limit, or a note that isn't there. */
  updateNote(id: string, text: string): boolean;
  connect(source: string, target: string): ConnectResult;
  disconnect(edgeIds: readonly string[]): void;
  /** Copies nodes (and the connections between them), offset slightly. Returns new ids. */
  duplicateNodes(ids: readonly string[]): string[];
  /**
   * Adds copies of nodes from anywhere, e.g. the clipboard (M03), moved by
   * `shift`, with new ids, names that don't clash, and the connections among
   * them. One undo step. Returns the new ids, in order.
   */
  pasteNodes(
    nodes: readonly SystemNode[],
    edges: readonly { source: string; target: string }[],
    shift: Position,
  ): string[];
  /** The chaos timeline (S40). Returns the new event's id. */
  addEvent(event: NewScenarioEvent): string;
  /** Replace an event, keeping its id. Rejects one that isn't valid. */
  updateEvent(id: string, event: NewScenarioEvent): boolean;
  removeEvent(id: string): void;
  /** Group every change until endGesture (a node drag, a slider drag) into one undo step. */
  beginGesture(): void;
  endGesture(): void;
};

export type DesignState = { doc: SystemDocument } & DesignActions;

export type DesignStoreOptions = {
  registry: Registry;
  doc: SystemDocument;
  newId?: () => string;
  now?: () => number;
  historyLimit?: number;
};

const NAME_MAX = 80;
const DUPLICATE_OFFSET = 32;

/** "Service" → "Service", or "Service 2" if taken, then "Service 3"… */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * A copy's name: its own if that's free; otherwise the next number, so
 * "Service 2" → "Service 3" and "API · 1" → "API · 2", and "Links DB" →
 * "Links DB 2".
 */
export function copyName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const numbered = /^(.*\D)\d+$/.exec(name);
  if (!numbered) return uniqueName(name, taken);
  const prefix = numbered[1] as string;
  for (let n = 2; ; n++) {
    if (!taken.has(`${prefix}${n}`)) return `${prefix}${n}`;
  }
}

/** Whether any of a component's settings differs from its default (a missing one is the default). */
export function hasCustomParams(
  node: Pick<SystemNode, "params">,
  definition: { params: Readonly<Record<string, { default: unknown }>> },
): boolean {
  return Object.entries(definition.params).some(
    ([key, spec]) => key in node.params && node.params[key] !== spec.default,
  );
}

function cleanName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed === "" || trimmed.length > NAME_MAX ? null : trimmed;
}

/** Drop timeline events aimed at components or connections that no longer exist. */
function pruneEvents(doc: SystemDocument): void {
  if (!doc.scenario) return;
  const nodes = new Set(doc.nodes.map((n) => n.id));
  const edges = new Set(doc.edges.map((e) => e.id));
  doc.scenario.events = doc.scenario.events.filter((event) => {
    const target = eventTarget(event);
    if (!target) return true;
    return "node" in target ? nodes.has(target.node) : edges.has(target.edge);
  });
}

export function createDesignStore({
  registry,
  doc,
  newId = () => crypto.randomUUID(),
  now = () => Date.now(),
  historyLimit = 100,
}: DesignStoreOptions) {
  let gestureOrigin: SystemDocument | null = null;

  const store = createStore<DesignState>()(
    temporal(
      immer((set, get) => {
        const nodeById = (id: string): SystemNode | undefined =>
          get().doc.nodes.find((node) => node.id === id);

        /** Apply an edit to the document and stamp it as updated. */
        const edit = (recipe: (draft: SystemDocument) => void) =>
          set((state) => {
            recipe(state.doc);
            state.doc.meta.updatedAt = now();
          });

        return {
          doc,

          load(next) {
            gestureOrigin = null;
            set({ doc: next });
            store.temporal.getState().clear();
          },

          renameSystem(name) {
            const clean = cleanName(name);
            if (!clean) return false;
            if (clean !== get().doc.name) {
              edit((d) => {
                d.name = clean;
              });
            }
            return true;
          },

          addNode(type, position) {
            const definition = registry.require(type);
            const id = newId();
            const taken = new Set(get().doc.nodes.map((n) => n.name));
            edit((d) => {
              d.nodes.push({
                id,
                type,
                name: uniqueName(definition.displayName, taken),
                position: { ...position },
                params: defaultParams(definition),
              });
            });
            return id;
          },

          moveNodes(moves) {
            const notes = get().doc.notes ?? [];
            const targets = moves.filter(({ id, position }) => {
              const item = nodeById(id) ?? notes.find((n) => n.id === id);
              return item && (item.position.x !== position.x || item.position.y !== position.y);
            });
            if (targets.length === 0) return;
            edit((d) => {
              for (const { id, position } of targets) {
                const item = d.nodes.find((n) => n.id === id) ?? d.notes?.find((n) => n.id === id);
                if (item) item.position = { ...position };
              }
            });
          },

          renameNode(id, name) {
            const node = nodeById(id);
            const clean = cleanName(name);
            if (!node || !clean) return false;
            if (clean !== node.name) {
              edit((d) => {
                const draft = d.nodes.find((n) => n.id === id);
                if (draft) draft.name = clean;
              });
            }
            return true;
          },

          updateParams(id, patch) {
            const node = nodeById(id);
            if (!node) return false;
            const result = paramsSchema(registry.require(node.type)).safeParse({
              ...node.params,
              ...patch,
            });
            if (!result.success) return false;
            const changed = Object.entries(result.data).some(([k, v]) => node.params[k] !== v);
            if (changed) {
              edit((d) => {
                const draft = d.nodes.find((n) => n.id === id);
                if (draft) draft.params = result.data;
              });
            }
            return true;
          },

          setNodeIcon(id, icon) {
            const node = nodeById(id);
            if (!node || (node.icon ?? null) === icon) return;
            edit((d) => {
              const draft = d.nodes.find((n) => n.id === id);
              if (!draft) return;
              if (icon === null) delete draft.icon;
              else draft.icon = icon;
            });
          },

          resetParams(ids) {
            const reset = get().doc.nodes.filter((n) => {
              const definition = registry.get(n.type);
              return ids.includes(n.id) && definition && hasCustomParams(n, definition);
            });
            if (reset.length === 0) return;
            edit((d) => {
              for (const node of d.nodes) {
                const definition = registry.get(node.type);
                if (definition && reset.some((r) => r.id === node.id)) {
                  node.params = defaultParams(definition);
                }
              }
            });
          },

          removeNodes(ids) {
            const remove = new Set(ids);
            const { nodes, notes } = get().doc;
            const any = (items: readonly { id: string }[] = []) =>
              items.some((i) => remove.has(i.id));
            if (!any(nodes) && !any(notes)) return;
            edit((d) => {
              d.nodes = d.nodes.filter((n) => !remove.has(n.id));
              d.edges = d.edges.filter((e) => !remove.has(e.source) && !remove.has(e.target));
              if (d.notes) d.notes = d.notes.filter((n) => !remove.has(n.id));
              pruneEvents(d);
            });
          },

          setSeed(seed) {
            if (!Number.isInteger(seed) || seed < 1 || seed > MAX_SEED) return false;
            if ((get().doc.seed ?? DEFAULT_SEED) !== seed) {
              edit((d) => {
                d.seed = seed;
              });
            }
            return true;
          },

          addNote(position, text = "") {
            const id = newId();
            edit((d) => {
              d.notes ??= [];
              d.notes.push({ id, text: text.slice(0, NOTE_MAX_LENGTH), position: { ...position } });
            });
            return id;
          },

          updateNote(id, text) {
            const note = get().doc.notes?.find((n) => n.id === id);
            if (!note || text.length > NOTE_MAX_LENGTH) return false;
            if (note.text === text) return true;
            edit((d) => {
              const target = d.notes?.find((n) => n.id === id);
              if (target) target.text = text;
            });
            return true;
          },

          addEvent(event) {
            const id = newId();
            const parsed = scenarioEventSchema.safeParse({ ...event, id });
            if (!parsed.success)
              throw new Error(`Invalid event: ${parsed.error.issues[0]?.message}`);
            edit((d) => {
              d.scenario ??= { events: [] };
              d.scenario.events.push(parsed.data);
              d.scenario.events.sort((a, b) => a.at - b.at);
            });
            return id;
          },

          updateEvent(id, event) {
            const parsed = scenarioEventSchema.safeParse({ ...event, id });
            const events = get().doc.scenario?.events ?? [];
            if (!parsed.success || !events.some((e) => e.id === id)) return false;
            edit((d) => {
              if (!d.scenario) return;
              d.scenario.events = d.scenario.events
                .map((e) => (e.id === id ? parsed.data : e))
                .sort((a, b) => a.at - b.at);
            });
            return true;
          },

          removeEvent(id) {
            if (!get().doc.scenario?.events.some((e) => e.id === id)) return;
            edit((d) => {
              if (!d.scenario) return;
              d.scenario.events = d.scenario.events.filter((e) => e.id !== id);
            });
          },

          connect(source, target) {
            const check = checkConnection(get().doc, registry, source, target);
            if (!check.ok) return check;
            const edgeId = newId();
            edit((d) => void d.edges.push({ id: edgeId, source, target }));
            return { ok: true, edgeId };
          },

          disconnect(edgeIds) {
            const remove = new Set(edgeIds);
            if (!get().doc.edges.some((e) => remove.has(e.id))) return;
            edit((d) => {
              d.edges = d.edges.filter((e) => !remove.has(e.id));
              pruneEvents(d);
            });
          },

          duplicateNodes(ids) {
            const { nodes, edges } = get().doc;
            const originals = nodes.filter((n) => ids.includes(n.id));
            return get().pasteNodes(originals, edges, { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET });
          },

          pasteNodes(originals, edges, shift) {
            const known = originals.filter((n) => registry.get(n.type));
            if (known.length === 0) return [];
            const idMap = new Map(known.map((n) => [n.id, newId()]));
            const taken = new Set(get().doc.nodes.map((n) => n.name));
            const copies: SystemNode[] = known.map((n) => {
              const name = copyName(n.name, taken);
              taken.add(name);
              return {
                ...structuredClone(n),
                id: idMap.get(n.id) as string,
                name,
                position: { x: n.position.x + shift.x, y: n.position.y + shift.y },
              };
            });
            // Only connections inside the copied set that are allowed, each once.
            const types = new Map(known.map((n) => [n.id, registry.get(n.type)]));
            const seen = new Set<string>();
            const copiedEdges = edges.flatMap((e) => {
              const source = idMap.get(e.source);
              const target = idMap.get(e.target);
              const key = `${source}->${target}`;
              if (!source || !target || source === target || seen.has(key)) return [];
              const from = types.get(e.source);
              const to = types.get(e.target);
              if (!from || !to || !canConnect(from, to).ok) return [];
              seen.add(key);
              return [{ id: newId(), source, target }];
            });

            edit((d) => {
              d.nodes.push(...copies);
              d.edges.push(...copiedEdges);
            });
            return copies.map((c) => c.id);
          },

          beginGesture() {
            if (gestureOrigin) return;
            gestureOrigin = get().doc;
            store.temporal.getState().pause();
          },

          endGesture() {
            const origin = gestureOrigin;
            if (!origin) return;
            gestureOrigin = null;
            const final = get().doc;
            const temporalState = store.temporal.getState();
            if (final === origin) {
              temporalState.resume();
              return;
            }
            // Rewind to where the gesture started (untracked), then apply the end
            // result tracked, so the whole gesture becomes one undo step.
            set({ doc: origin });
            temporalState.resume();
            set({ doc: final });
          },
        };
      }),
      {
        partialize: (state) => ({ doc: state.doc }),
        equality: (past, current) => past.doc === current.doc,
        limit: historyLimit,
      },
    ),
  );

  return store;
}

export type DesignStore = ReturnType<typeof createDesignStore>;
