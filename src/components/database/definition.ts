import type { ComponentDefinition } from "../../model/component.ts";
import { concurrencyParam, errorRateParam, maxWaitingParam, workTimeParam } from "../shared.ts";

export const database: ComponentDefinition = {
  type: "database",
  category: "data",
  displayName: "Database",
  description: "Stores your data and answers queries about it.",
  modelNote:
    "It runs a limited number of queries at once (its connections); the rest wait in line. " +
    "Reads and writes take different amounts of time; a search scans every row, so it takes far longer. " +
    "Connected read replicas and search indexes receive every write after a delay. " +
    "Locks and disk details are not modelled; query time stands in for all of them.",
  icon: "database",
  keywords: ["db", "sql", "storage", "primary"],
  params: {
    connections: concurrencyParam("Connections", 50),
    readTime: workTimeParam("Read time", 5),
    writeTime: workTimeParam("Write time", 12),
    searchTime: {
      ...workTimeParam("Search time", 250),
      help: "A search without a search index scans every row, so it's far slower than a read by key.",
    },
    maxWaiting: maxWaitingParam(500),
    errorRate: errorRateParam,
  },
  connections: {
    incoming: true,
    outgoing: ["read-replica", "search-index"],
  },
};
