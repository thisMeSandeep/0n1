import type { ComponentDefinition } from "../../model/component.ts";

export const cdn: ComponentDefinition = {
  type: "cdn",
  category: "network",
  displayName: "CDN",
  description: "Serves copies of popular content from servers close to your users.",
  modelNote:
    "A share of reads is answered at the edge (the hit ratio you set), quickly and without touching your system. " +
    "Misses and all writes go on to the connected origin. " +
    "Capacity is treated as unlimited, which is close to true for large CDNs.",
  icon: "globe-hemisphere-west",
  keywords: ["edge", "static", "content delivery"],
  params: {
    hitRatio: {
      kind: "number",
      label: "Hit ratio",
      section: "behaviour",
      help: "Share of reads answered from the edge.",
      default: 80,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    edgeTime: {
      kind: "number",
      label: "Response time on a hit",
      section: "behaviour",
      default: 15,
      min: 1,
      max: 500,
      scale: "log",
      unit: "ms",
    },
  },
  connections: {
    incoming: true,
    outgoingRequired: true,
    outgoing: ["load-balancer", "api-gateway", "service"],
  },
};
