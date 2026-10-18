import type { ComponentDefinition } from "../../model/component.ts";
import { concurrencyParam, errorRateParam, maxWaitingParam, workTimeParam } from "../shared.ts";

export const shardedDatabase: ComponentDefinition = {
  type: "sharded-database",
  category: "data",
  displayName: "Sharded database",
  description:
    "A database split into shards, each holding part of the data, so it can grow past one machine.",
  modelNote:
    "Each shard is a database of its own: its own connections, its own line. A request's key decides its shard. " +
    "Spread by hash, keys scatter evenly, but one very popular key still lands on one shard. Spread by range, neighbouring keys share a shard, so the most popular keys pile onto the first one. " +
    "The component shows its busiest shard, because that's the one that breaks first. " +
    "Searches have no index to use, so the shard they reach scans. Rebalancing and cross-shard queries are not modelled.",
  icon: "rows",
  keywords: ["shard", "partition", "db", "horizontal scaling", "split"],
  params: {
    shards: {
      kind: "number",
      label: "Shards",
      section: "capacity",
      default: 4,
      min: 1,
      max: 64,
      step: 1,
    },
    connections: { ...concurrencyParam("Connections per shard", 25) },
    spread: {
      kind: "choice",
      label: "Spread keys by",
      section: "behaviour",
      default: "hash",
      options: [
        { value: "hash", label: "Hash: scattered evenly" },
        { value: "range", label: "Range: neighbours together" },
      ],
    },
    keyRange: {
      kind: "number",
      label: "Key range",
      section: "behaviour",
      help: "How many keys the shards split between them, in order. Match the clients' Distinct keys.",
      default: 100_000,
      min: 1,
      max: 10_000_000,
      step: 1,
      scale: "log",
      shownWhen: { param: "spread", values: ["range"] },
    },
    readTime: workTimeParam("Read time", 5),
    writeTime: workTimeParam("Write time", 12),
    searchTime: {
      ...workTimeParam("Search time", 250),
      help: "A search scans every row of the shard it reaches.",
    },
    maxWaiting: { ...maxWaitingParam(500), label: "Max waiting per shard" },
    errorRate: errorRateParam,
  },
  connections: { incoming: true, outgoing: ["read-replica", "search-index"] },
};
