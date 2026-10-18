import type { ComponentDefinition } from "../../model/component.ts";

export const rateLimiter: ComponentDefinition = {
  type: "rate-limiter",
  category: "network",
  displayName: "Rate limiter",
  description: "Turns away requests above a set rate, so a flood can't reach what's behind it.",
  modelNote:
    "A token bucket: tokens refill at the limit and a request needs one to pass, so short bursts up to the burst size get through. " +
    "Requests over the limit are rejected at once (an HTTP 429), and the rest pass on to a connected target in turn. " +
    "Limiting each key gives every key its own bucket, like a per-user limit: a few very busy keys are held back while the rest are untouched. " +
    "The check itself takes no time; real limiters that share state across machines add a little.",
  icon: "gauge",
  keywords: ["throttle", "429", "quota", "token bucket", "rate limit"],
  params: {
    limit: {
      kind: "number",
      label: "Limit",
      section: "behaviour",
      help: "Requests per second let through, for everyone together or for each key.",
      default: 1000,
      min: 1,
      max: 1_000_000,
      step: 1,
      scale: "log",
      unit: "/s",
    },
    scope: {
      kind: "choice",
      label: "Limit applies to",
      section: "behaviour",
      default: "everyone",
      options: [
        { value: "everyone", label: "Everyone together" },
        { value: "key", label: "Each key (like each user)" },
      ],
    },
    burst: {
      kind: "number",
      label: "Burst",
      section: "behaviour",
      help: "How many requests can pass at once after a quiet spell, before the limit kicks in.",
      default: 50,
      min: 1,
      max: 100_000,
      step: 1,
      scale: "log",
    },
  },
  connections: {
    incoming: true,
    outgoingRequired: true,
    outgoing: ["load-balancer", "api-gateway", "service", "circuit-breaker"],
  },
};
