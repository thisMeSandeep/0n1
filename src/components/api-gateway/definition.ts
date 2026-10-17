import type { ComponentDefinition } from "../../model/component.ts";
import { addedDelayParam, throughputLimitParam } from "../shared.ts";

export const apiGateway: ComponentDefinition = {
  type: "api-gateway",
  category: "network",
  displayName: "API gateway",
  description: "The front door for your APIs: checks requests, limits them and routes them on.",
  modelNote:
    "Every request pays a small processing delay, then goes to a connected target in turn. " +
    "With rate limiting on, requests above the limit are rejected straight away instead of reaching your services. " +
    "Authentication and routing rules are not modelled.",
  icon: "shield-check",
  keywords: ["gateway", "rate limit", "front door"],
  params: {
    delay: addedDelayParam(2),
    throughputLimit: throughputLimitParam(20_000),
    rateLimiting: {
      kind: "toggle",
      label: "Rate limiting",
      section: "behaviour",
      help: "Reject requests above a set rate to protect what's behind it.",
      default: false,
    },
    rateLimit: {
      kind: "number",
      label: "Rate limit",
      section: "behaviour",
      default: 1000,
      min: 1,
      max: 1_000_000,
      step: 1,
      scale: "log",
      unit: "/s",
    },
  },
  connections: {
    incoming: true,
    outgoingRequired: true,
    outgoing: ["load-balancer", "service"],
  },
};
