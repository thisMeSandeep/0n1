import type { ComponentDefinition } from "../../model/component.ts";
import { addedDelayParam, throughputLimitParam } from "../shared.ts";

export const loadBalancer: ComponentDefinition = {
  type: "load-balancer",
  category: "network",
  displayName: "Load balancer",
  description: "Spreads incoming requests across the components behind it.",
  modelNote:
    "Each request goes to one connected target, picked by the strategy you choose. " +
    "It adds a small fixed delay and turns requests away above its throughput limit. " +
    "With health checks on, it skips targets that are down; with them off, requests to a down target fail.",
  icon: "git-fork",
  params: {
    strategy: {
      kind: "choice",
      label: "Strategy",
      section: "behaviour",
      default: "round-robin",
      options: [
        { value: "round-robin", label: "Round robin: take turns" },
        { value: "least-busy", label: "Least busy: fewest requests in progress" },
      ],
    },
    delay: addedDelayParam(1),
    throughputLimit: throughputLimitParam(50_000),
    healthChecks: {
      kind: "toggle",
      label: "Skip targets that are down",
      section: "failure",
      default: true,
    },
  },
  connections: {
    incoming: true,
    outgoing: ["service", "api-gateway"],
  },
};
