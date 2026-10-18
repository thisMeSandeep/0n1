import type { ComponentDefinition } from "../../model/component.ts";
import { errorRateParam, workTimeParam } from "../shared.ts";

export const dns: ComponentDefinition = {
  type: "dns",
  category: "network",
  displayName: "DNS",
  description: "Tells clients where to send their requests.",
  modelNote:
    "Connect clients to it. Before sending, a client's users look up the system's address, and keep the answer for the TTL. " +
    "Answers expire at different moments for different users, so only a trickle of lookups reaches it. " +
    "If it goes down, nothing breaks at first: users with a cached answer carry on, and the rest fail, more as answers expire. " +
    "A client connected to two tries the second when the first fails. Old answers aren't used once expired.",
  icon: "signpost",
  keywords: ["domain", "name", "resolver", "address", "lookup"],
  params: {
    lookupTime: workTimeParam("Lookup time", 10, 1000),
    ttl: {
      kind: "number",
      label: "Answer TTL",
      section: "behaviour",
      help: "How long users keep an answer before looking it up again.",
      default: 60,
      min: 1,
      max: 86_400,
      step: 1,
      scale: "log",
      unit: "s",
    },
    errorRate: errorRateParam,
  },
  connections: { incoming: true, outgoing: [] },
};
