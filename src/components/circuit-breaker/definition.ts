import type { ComponentDefinition } from "../../model/component.ts";

export const circuitBreaker: ComponentDefinition = {
  type: "circuit-breaker",
  category: "network",
  displayName: "Circuit breaker",
  description:
    "Watches calls to something that might fail, and stops calling it for a while when it does.",
  modelNote:
    "Closed, it passes calls on and watches them over a recent window; a call fails if it errors or takes longer than the call timeout. " +
    "Once enough calls have been seen and too many failed, it opens: every call fails at once, so the dependency gets a break and callers don't wait. " +
    "After the cool-down it's half-open and lets a few test calls through. If they all succeed it closes again; if one fails it opens again. " +
    "Real breakers often count slow calls separately and keep a fallback answer; here a failed call simply fails.",
  icon: "plugs-connected",
  // Not "fallback": it would match a search for "lb".
  keywords: ["breaker", "fail fast", "resilience", "trip", "bulkhead"],
  liveDetail: "state",
  params: {
    threshold: {
      kind: "number",
      label: "Opens at",
      section: "behaviour",
      help: "Share of recent calls that must fail for it to open.",
      default: 50,
      min: 1,
      max: 100,
      step: 1,
      unit: "%",
    },
    minimumCalls: {
      kind: "number",
      label: "Judges after",
      section: "behaviour",
      help: "Calls it must have seen in the window before it can open.",
      default: 20,
      min: 1,
      max: 10_000,
      step: 1,
      scale: "log",
      unit: "calls",
    },
    window: {
      kind: "number",
      label: "Window",
      section: "behaviour",
      help: "How far back it looks when counting failures.",
      default: 10,
      min: 1,
      max: 600,
      scale: "log",
      unit: "s",
    },
    coolDown: {
      kind: "number",
      label: "Stays open for",
      section: "behaviour",
      default: 5,
      min: 0.1,
      max: 600,
      scale: "log",
      unit: "s",
    },
    probes: {
      kind: "number",
      label: "Test calls",
      section: "behaviour",
      help: "How many calls it lets through when half-open, to see if the dependency is back.",
      default: 5,
      min: 1,
      max: 100,
      step: 1,
    },
    timeout: {
      kind: "number",
      label: "Call timeout",
      section: "failure",
      help: "A call taking longer than this counts as failed, and its caller is told so.",
      default: 1000,
      min: 10,
      max: 60_000,
      scale: "log",
      unit: "ms",
    },
  },
  connections: {
    incoming: true,
    outgoingRequired: true,
    outgoing: ["service", "load-balancer", "api-gateway"],
  },
};
