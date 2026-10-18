import type { BehaviourFactory } from "../engine/runtime/types.ts";
import { apiGateway } from "./api-gateway/behaviour.ts";
import { cache } from "./cache/behaviour.ts";
import { cdn } from "./cdn/behaviour.ts";
import { circuitBreaker } from "./circuit-breaker/behaviour.ts";
import { client } from "./client/behaviour.ts";
import { database } from "./database/behaviour.ts";
import { loadBalancer } from "./load-balancer/behaviour.ts";
import { queue } from "./queue/behaviour.ts";
import { rateLimiter } from "./rate-limiter/behaviour.ts";
import { readReplica } from "./read-replica/behaviour.ts";
import { service } from "./service/behaviour.ts";
import { worker } from "./worker/behaviour.ts";

/** How each component type behaves in the simulation, by type id. */
export const BEHAVIOURS: Readonly<Partial<Record<string, BehaviourFactory>>> = {
  client,
  "load-balancer": loadBalancer,
  "api-gateway": apiGateway,
  cdn,
  "rate-limiter": rateLimiter,
  "circuit-breaker": circuitBreaker,
  service,
  database,
  cache,
  "read-replica": readReplica,
  queue,
  worker,
};
