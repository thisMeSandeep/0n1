import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import { defaultParams, type Params, paramsSchema } from "../model/component.ts";
import { checkConnection } from "../model/connections.ts";
import type { Position, SystemDocument, SystemNode } from "../model/document.ts";
import type { Registry } from "../model/registry.ts";

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
  moveNodes(moves: readonly { id: string; position: Position }[]): void;
  renameNode(id: string, name: string): boolean;
  /** Merges and validates against the component's schema. Rejects invalid values. */
  updateParams(id: string, patch: Params): boolean;
  /** Removes nodes and every connection touching them. */
  removeNodes(ids: readonly string[]): void;
  connect(source: string, target: string): ConnectResult;
  disconnect(edgeIds: readonly string[]): void;
  /** Copies nodes (and the connections between them), offset slightly. Returns new ids. */
  duplicateNodes(ids: readonly string[]): string[];
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

function cleanName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed === "" || trimmed.length > NAME_MAX ? null : trimmed;
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
            const targets = moves.filter(({ id, position }) => {
              const node = nodeById(id);
              return node && (node.position.x !== position.x || node.position.y !== position.y);
            });
            if (targets.length === 0) return;
            edit((d) => {
              for (const { id, position } of targets) {
                const node = d.nodes.find((n) => n.id === id);
                if (node) node.position = { ...position };
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

          removeNodes(ids) {
            const remove = new Set(ids);
            if (!get().doc.nodes.some((n) => remove.has(n.id))) return;
            edit((d) => {
              d.nodes = d.nodes.filter((n) => !remove.has(n.id));
              d.edges = d.edges.filter((e) => !remove.has(e.source) && !remove.has(e.target));
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
            });
          },

          duplicateNodes(ids) {
            const { nodes, edges } = get().doc;
            const originals = nodes.filter((n) => ids.includes(n.id));
            if (originals.length === 0) return [];

            const idMap = new Map(originals.map((n) => [n.id, newId()]));
            const taken = new Set(nodes.map((n) => n.name));
            const copies: SystemNode[] = originals.map((n) => {
              // "Service 2" → "Service 3", not "Service 2 2".
              const name = uniqueName(n.name.replace(/ \d+$/, ""), taken);
              taken.add(name);
              return {
                ...structuredClone(n),
                id: idMap.get(n.id) as string,
                name,
                position: {
                  x: n.position.x + DUPLICATE_OFFSET,
                  y: n.position.y + DUPLICATE_OFFSET,
                },
              };
            });
            const copiedEdges = edges
              .filter((e) => idMap.has(e.source) && idMap.has(e.target))
              .map((e) => ({
                id: newId(),
                source: idMap.get(e.source) as string,
                target: idMap.get(e.target) as string,
              }));

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
