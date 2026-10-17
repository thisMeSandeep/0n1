import type { BehaviourFactory } from "../engine/runtime/types.ts";
import { client } from "./client/behaviour.ts";
import { service } from "./service/behaviour.ts";

/** How each component type behaves in the simulation. The rest arrive in S23–S25. */
export const BEHAVIOURS: Readonly<Partial<Record<string, BehaviourFactory>>> = {
  client,
  service,
};
