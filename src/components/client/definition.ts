import type { ComponentDefinition } from "../../model/component.ts";

export const client: ComponentDefinition = {
  type: "client",
  category: "traffic",
  displayName: "Client",
  description: "Sends requests to your system and waits for answers.",
  modelNote:
    "Requests arrive at random moments at the average rate you set (a Poisson process). " +
    "Each one is a read or a write for a key; with hot keys, a few keys get most of the traffic (Zipf). " +
    "The client doesn't slow down when the system struggles, which is how real traffic behaves.",
  icon: "desktop",
  keywords: ["user", "browser", "traffic", "load"],
  params: {
    rate: {
      kind: "number",
      label: "Requests per second",
      section: "behaviour",
      default: 100,
      min: 1,
      max: 100_000,
      step: 1,
      scale: "log",
      unit: "/s",
    },
    readShare: {
      kind: "number",
      label: "Reads",
      section: "behaviour",
      help: "Share of requests that read data. The rest write.",
      default: 90,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    keys: {
      kind: "number",
      label: "Distinct keys",
      section: "behaviour",
      help: "How many different items requests ask for, like short links or user ids.",
      default: 100_000,
      min: 1,
      max: 10_000_000,
      step: 1,
      scale: "log",
    },
    keyPopularity: {
      kind: "choice",
      label: "Key popularity",
      section: "behaviour",
      default: "hot",
      options: [
        { value: "hot", label: "A few keys are very popular" },
        { value: "uniform", label: "Every key equally likely" },
      ],
    },
    timeout: {
      kind: "number",
      label: "Timeout",
      section: "failure",
      help: "How long it waits before giving up on a request.",
      default: 1000,
      min: 10,
      max: 60_000,
      scale: "log",
      unit: "ms",
    },
    retries: {
      kind: "number",
      label: "Retries",
      section: "failure",
      help: "Extra tries after a timeout or error. Retries add load when things are already slow.",
      default: 0,
      min: 0,
      max: 5,
      step: 1,
    },
  },
  connections: {
    incoming: false,
    outgoing: ["cdn", "load-balancer", "api-gateway", "service"],
  },
};
