import type { ComponentDefinition } from "../model/component.ts";
import { createRegistry } from "../model/registry.ts";
import { apiGateway } from "./api-gateway/definition.ts";
import { cache } from "./cache/definition.ts";
import { cdn } from "./cdn/definition.ts";
import { circuitBreaker } from "./circuit-breaker/definition.ts";
import { client } from "./client/definition.ts";
import { database } from "./database/definition.ts";
import { loadBalancer } from "./load-balancer/definition.ts";
import { objectStorage } from "./object-storage/definition.ts";
import { queue } from "./queue/definition.ts";
import { rateLimiter } from "./rate-limiter/definition.ts";
import { readReplica } from "./read-replica/definition.ts";
import { searchIndex } from "./search-index/definition.ts";
import { service } from "./service/definition.ts";
import { shardedDatabase } from "./sharded-database/definition.ts";
import { worker } from "./worker/definition.ts";

/** Every component, in palette order within each category. */
export const componentDefinitions: readonly ComponentDefinition[] = [
  client,
  loadBalancer,
  apiGateway,
  cdn,
  rateLimiter,
  circuitBreaker,
  service,
  worker,
  database,
  shardedDatabase,
  cache,
  readReplica,
  searchIndex,
  objectStorage,
  queue,
];

/** The app's component registry. Building it validates every definition. */
export const registry = createRegistry(componentDefinitions);
