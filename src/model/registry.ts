import {
  CATEGORIES,
  type Category,
  type ComponentDefinition,
  type ParamSpec,
} from "./component.ts";

export type Registry = {
  get(type: string): ComponentDefinition | undefined;
  /** Like `get`, but throws for unknown types. */
  require(type: string): ComponentDefinition;
  list(): readonly ComponentDefinition[];
  /** Definitions grouped by category, in palette order. */
  byCategory(): ReadonlyMap<Category, readonly ComponentDefinition[]>;
};

const TYPE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Throws a descriptive error if a definition is internally inconsistent. */
export function validateDefinition(definition: ComponentDefinition): void {
  const where = `Component "${definition.type}"`;
  if (!TYPE_ID.test(definition.type)) throw new Error(`${where}: type must be kebab-case`);
  for (const field of ["displayName", "description", "modelNote", "icon"] as const) {
    if (definition[field].trim() === "") throw new Error(`${where}: ${field} is empty`);
  }
  for (const [key, spec] of Object.entries(definition.params)) {
    validateParam(`${where}, param "${key}"`, spec);
  }
}

function validateParam(where: string, spec: ParamSpec): void {
  if (spec.label.trim() === "") throw new Error(`${where}: label is empty`);
  switch (spec.kind) {
    case "number":
      if (!(spec.max > spec.min)) throw new Error(`${where}: max must be greater than min`);
      if (spec.scale === "log" && spec.min <= 0)
        throw new Error(`${where}: log scale needs min > 0`);
      if (spec.default < spec.min || spec.default > spec.max) {
        throw new Error(`${where}: default ${spec.default} is outside ${spec.min}–${spec.max}`);
      }
      return;
    case "choice":
      if (!spec.options.some((option) => option.value === spec.default)) {
        throw new Error(`${where}: default "${spec.default}" is not one of the options`);
      }
      return;
    case "toggle":
      return;
  }
}

export function createRegistry(definitions: readonly ComponentDefinition[]): Registry {
  const byType = new Map<string, ComponentDefinition>();
  for (const definition of definitions) {
    validateDefinition(definition);
    if (byType.has(definition.type))
      throw new Error(`Duplicate component type "${definition.type}"`);
    byType.set(definition.type, definition);
  }
  for (const definition of definitions) {
    for (const target of definition.connections.outgoing) {
      if (!byType.has(target)) {
        throw new Error(`Component "${definition.type}": unknown outgoing type "${target}"`);
      }
    }
  }

  const grouped = new Map<Category, ComponentDefinition[]>(CATEGORIES.map((c) => [c, []]));
  for (const definition of definitions) grouped.get(definition.category)?.push(definition);

  return {
    get: (type) => byType.get(type),
    require(type) {
      const definition = byType.get(type);
      if (!definition) throw new Error(`Unknown component type "${type}"`);
      return definition;
    },
    list: () => definitions,
    byCategory: () => grouped,
  };
}
