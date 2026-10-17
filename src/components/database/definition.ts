import type { ComponentDefinition } from "../../model/component.ts";
import { concurrencyParam, errorRateParam, maxWaitingParam, workTimeParam } from "../shared.ts";

export const database: ComponentDefinition = {
  type: "database",
  category: "data",
  displayName: "Database",
  description: "Stores your data and answers queries about it.",
  modelNote:
    "It runs a limited number of queries at once (its connections); the rest wait in line. " +
    "Reads and writes take different amounts of time. " +
    "Connected read replicas receive every write after a delay. " +
    "Indexes, locks and disk details are not modelled; query time stands in for all of them.",
  icon: "database",
  keywords: ["db", "sql", "storage", "primary"],
  params: {
    connections: concurrencyParam("Connections", 50),
    readTime: workTimeParam("Read time", 5),
    writeTime: workTimeParam("Write time", 12),
    maxWaiting: maxWaitingParam(500),
    errorRate: errorRateParam,
  },
  connections: {
    incoming: true,
    outgoing: ["read-replica"],
  },
};
