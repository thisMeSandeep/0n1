import type { ComponentDefinition } from "../../model/component.ts";
import { concurrencyParam } from "../shared.ts";

export const cache: ComponentDefinition = {
  type: "cache",
  category: "data",
  displayName: "Cache",
  description: "Keeps recently used data in memory so reads are fast.",
  modelNote:
    "It holds up to a set number of keys and drops the least recently used when full. " +
    "Entries expire after the TTL. " +
    "The hit ratio isn't a setting: it emerges from the cache size and how popular keys are. " +
    "Services use it cache-aside: they check it first, and on a miss read the database and store the result.",
  icon: "lightning",
  params: {
    size: {
      kind: "number",
      label: "Keys held",
      section: "capacity",
      help: "How many items fit before old ones are dropped.",
      default: 10_000,
      min: 10,
      max: 10_000_000,
      step: 1,
      scale: "log",
    },
    concurrency: concurrencyParam("Requests at once", 128),
    responseTime: {
      kind: "number",
      label: "Response time",
      section: "behaviour",
      default: 1,
      min: 0.05,
      max: 100,
      scale: "log",
      unit: "ms",
    },
    ttl: {
      kind: "number",
      label: "Expiry (TTL)",
      section: "behaviour",
      help: "How long an item stays before it must be fetched again.",
      default: 300,
      min: 1,
      max: 86_400,
      step: 1,
      scale: "log",
      unit: "s",
    },
  },
  connections: {
    incoming: true,
    outgoing: [],
  },
};
