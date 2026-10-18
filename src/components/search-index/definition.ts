import type { ComponentDefinition } from "../../model/component.ts";
import { concurrencyParam, errorRateParam, maxWaitingParam, workTimeParam } from "../shared.ts";

export const searchIndex: ComponentDefinition = {
  type: "search-index",
  category: "data",
  displayName: "Search index",
  description: "Answers searches quickly, so the database doesn't have to scan for them.",
  modelNote:
    "It answers searches (a client's Searches share) with its own connections and waiting line, in a fraction of the time a database scan takes. " +
    "Connect the database to it: every write reaches it after the indexing delay, and a search that misses a write still on its way counts as a stale result. " +
    "Relevance, ranking and index size are not modelled.",
  icon: "list-magnifying-glass",
  keywords: ["search", "full text", "elastic", "inverted index", "find"],
  params: {
    connections: concurrencyParam("Connections", 32),
    queryTime: workTimeParam("Search time", 15),
    indexingDelay: {
      kind: "number",
      label: "Indexing delay",
      section: "behaviour",
      help: "How long a write takes to show up in search results.",
      default: 1000,
      min: 1,
      max: 600_000,
      scale: "log",
      unit: "ms",
    },
    maxWaiting: maxWaitingParam(500),
    errorRate: errorRateParam,
  },
  connections: { incoming: true, outgoing: [] },
};
