import type { ComponentDefinition } from "../../model/component.ts";
import { concurrencyParam, errorRateParam, workTimeParam } from "../shared.ts";

export const worker: ComponentDefinition = {
  type: "worker",
  category: "compute",
  displayName: "Worker",
  description: "Takes jobs from a queue or pub/sub and processes them in the background.",
  modelNote:
    "It pulls a new job from its queue (or message from its pub/sub) whenever it has a free slot, so it never takes more than it can handle; " +
    "the backlog stays in the queue instead. " +
    "Each job takes a random amount of work around the average you set, and may call what it's connected to.",
  icon: "gear-six",
  keywords: ["job", "background", "consumer"],
  params: {
    concurrency: concurrencyParam("Jobs at once", 4),
    workTime: workTimeParam("Work per job", 200, 60_000),
    errorRate: errorRateParam,
  },
  connections: {
    incoming: true,
    outgoing: [
      "service",
      "circuit-breaker",
      "cache",
      "database",
      "sharded-database",
      "search-index",
      "object-storage",
      "queue",
      "pubsub",
    ],
  },
};
