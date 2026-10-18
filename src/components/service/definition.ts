import type { ComponentDefinition } from "../../model/component.ts";
import { concurrencyParam, errorRateParam, maxWaitingParam, workTimeParam } from "../shared.ts";

export const service: ComponentDefinition = {
  type: "service",
  category: "compute",
  displayName: "Service",
  description: "Runs your application code, one instance of it.",
  modelNote:
    "It handles a limited number of requests at once; the rest wait in line, and the line has a maximum length. " +
    "Each request takes a random amount of work around the average you set. " +
    "It then calls what it's connected to: reads try a cache first and fall back to a database or replica; " +
    "writes go to the database or onto a queue.",
  icon: "cube",
  keywords: ["server", "backend", "app", "api", "instance"],
  params: {
    concurrency: concurrencyParam("Requests at once", 16),
    workTime: workTimeParam("Work per request", 20),
    maxWaiting: maxWaitingParam(1000),
    errorRate: errorRateParam,
  },
  connections: {
    incoming: true,
    outgoing: [
      "load-balancer",
      "service",
      "circuit-breaker",
      "cache",
      "database",
      "read-replica",
      "queue",
    ],
  },
};
