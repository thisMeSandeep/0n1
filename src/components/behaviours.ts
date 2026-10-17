import type { BehaviourFactory } from "../engine/runtime/types.ts";
import { apiGateway } from "./api-gateway/behaviour.ts";
import { client } from "./client/behaviour.ts";
import { loadBalancer } from "./load-balancer/behaviour.ts";
import { service } from "./service/behaviour.ts";

/** How each component type behaves in the simulation. Data and messaging arrive in S24–S25. */
export const BEHAVIOURS: Readonly<Partial<Record<string, BehaviourFactory>>> = {
  client,
  "load-balancer": loadBalancer,
  "api-gateway": apiGateway,
  service,
};
