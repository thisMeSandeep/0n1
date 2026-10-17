import type { ComponentDefinition } from "../model/component.ts";
import { createRegistry } from "../model/registry.ts";
import { apiGateway } from "./api-gateway/definition.ts";
import { cache } from "./cache/definition.ts";
import { cdn } from "./cdn/definition.ts";
import { client } from "./client/definition.ts";
import { database } from "./database/definition.ts";
import { loadBalancer } from "./load-balancer/definition.ts";
import { queue } from "./queue/definition.ts";
import { readReplica } from "./read-replica/definition.ts";
import { service } from "./service/definition.ts";
import { worker } from "./worker/definition.ts";

/** Every v1 component, in palette order within each category. */
export const componentDefinitions: readonly ComponentDefinition[] = [
  client,
  loadBalancer,
  apiGateway,
  cdn,
  service,
  worker,
  database,
  cache,
  readReplica,
  queue,
];

/** The app's component registry. Building it validates every definition. */
export const registry = createRegistry(componentDefinitions);
