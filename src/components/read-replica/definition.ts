import type { ComponentDefinition } from "../../model/component.ts";
import { concurrencyParam, errorRateParam, maxWaitingParam, workTimeParam } from "../shared.ts";

export const readReplica: ComponentDefinition = {
  type: "read-replica",
  category: "data",
  displayName: "Read replica",
  description: "A read-only copy of a database that takes read traffic off it.",
  modelNote:
    "It answers reads only, with its own connections and waiting line. " +
    "Writes reach it from the primary database after the replication lag, so recent writes may not be visible yet. " +
    "Connect a database to it to set up replication.",
  icon: "copy",
  keywords: ["replica", "db", "copy", "follower"],
  params: {
    connections: concurrencyParam("Connections", 50),
    readTime: workTimeParam("Read time", 5),
    replicationLag: {
      kind: "number",
      label: "Replication lag",
      section: "behaviour",
      help: "How long a write takes to reach this copy.",
      default: 100,
      min: 1,
      max: 60_000,
      scale: "log",
      unit: "ms",
    },
    maxWaiting: maxWaitingParam(500),
    errorRate: errorRateParam,
  },
  connections: {
    incoming: true,
    outgoing: [],
  },
};
