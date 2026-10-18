import { z } from "zod";
import { midSentence } from "./text.ts";

/**
 * Component definitions: everything 0n1 knows about a component type, as
 * data. The inspector form, parameter validation and connection rules are
 * all derived from this. Behaviour lives in the engine (Phase 3).
 */

export const CATEGORIES = ["traffic", "network", "compute", "data", "messaging"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Inspector sections (UIUX §7). */
export const PARAM_SECTIONS = ["capacity", "behaviour", "failure"] as const;
export type ParamSection = (typeof PARAM_SECTIONS)[number];

type ParamBase = {
  label: string;
  section: ParamSection;
  /** One plain sentence, shown as a hint. */
  help?: string;
  /** Key of a toggle param; this one only applies while that toggle is on. */
  enabledBy?: string;
  /**
   * Only shown while a choice param has one of these values, e.g. a spike's
   * size only when the traffic shape is "spike". Hidden params keep their values.
   */
  shownWhen?: { param: string; values: readonly string[] };
};

export type NumberParam = ParamBase & {
  kind: "number";
  default: number;
  min: number;
  max: number;
  step?: number;
  scale?: "linear" | "log";
  unit?: string;
};

export type ChoiceParam = ParamBase & {
  kind: "choice";
  default: string;
  options: readonly { value: string; label: string }[];
};

export type ToggleParam = ParamBase & {
  kind: "toggle";
  default: boolean;
};

export type ParamSpec = NumberParam | ChoiceParam | ToggleParam;

export type LiveDetail = "p99" | "hit" | "waiting" | "sent";

export type ComponentDefinition = {
  /** Stable, kebab-case id stored in documents, e.g. "load-balancer". Never rename. */
  type: string;
  category: Category;
  displayName: string;
  /** One plain sentence: what it does. */
  description: string;
  /** Honest note on how the simulation models it, and what it ignores. */
  modelNote: string;
  /** Icon key, resolved to a Phosphor icon by the UI. */
  icon: string;
  /** Extra search terms for the palette, e.g. "db". Generic words only, no vendor names. */
  keywords?: readonly string[];
  params: Readonly<Record<string, ParamSpec>>;
  /**
   * The number shown beside its rate while running (default "p99"):
   * "hit" (caches), "waiting" (queues), or "sent" for components that only
   * send traffic, whose rate is what they send.
   */
  liveDetail?: LiveDetail;
  connections: {
    /** Whether other components can send requests to this one. */
    incoming: boolean;
    /** Component types this one may send requests to. */
    outgoing: readonly string[];
    /** It only makes sense when it passes requests on (e.g. a load balancer). */
    outgoingRequired?: boolean;
  };
};

export type Params = Record<string, number | string | boolean>;

function paramSchema(spec: ParamSpec) {
  switch (spec.kind) {
    case "number":
      return z.number().min(spec.min).max(spec.max).default(spec.default);
    case "choice": {
      const [first, ...rest] = spec.options.map((option) => option.value);
      if (first === undefined) throw new Error(`Choice "${spec.label}" has no options`);
      return z.enum([first, ...rest]).default(spec.default);
    }
    case "toggle":
      return z.boolean().default(spec.default);
  }
}

/** A Zod schema for a component's parameters. Missing values take their defaults. */
export function paramsSchema(definition: ComponentDefinition) {
  const shape = Object.fromEntries(
    Object.entries(definition.params).map(([key, spec]) => [key, paramSchema(spec)]),
  );
  return z.object(shape);
}

export function defaultParams(definition: ComponentDefinition): Params {
  return Object.fromEntries(
    Object.entries(definition.params).map(([key, spec]) => [key, spec.default]),
  );
}

export type ConnectionCheck = { ok: true } | { ok: false; reason: string };

/** Whether `source` may send requests to `target`, with a plain reason when not. */
export function canConnect(
  source: ComponentDefinition,
  target: ComponentDefinition,
): ConnectionCheck {
  if (source.connections.outgoing.length === 0) {
    return {
      ok: false,
      reason: `${source.displayName} doesn't send requests to other components.`,
    };
  }
  if (!target.connections.incoming) {
    return { ok: false, reason: `${target.displayName} doesn't take requests.` };
  }
  if (!source.connections.outgoing.includes(target.type)) {
    return {
      ok: false,
      reason: `${source.displayName} can't send requests to ${article(target.displayName)}.`,
    };
  }
  return { ok: true };
}

function article(name: string): string {
  return `${/^[aeiou]/i.test(name) ? "an" : "a"} ${midSentence(name)}`;
}
