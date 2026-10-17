import type { ComponentDefinition } from "./component.ts";

/** Minimal definitions for model tests. The real v1 components arrive in S07. */

export const testClient: ComponentDefinition = {
  type: "client",
  category: "traffic",
  displayName: "Client",
  description: "Sends requests and waits for answers.",
  modelNote: "Requests arrive at random, at the configured average rate.",
  icon: "desktop",
  params: {
    rate: {
      kind: "number",
      label: "Requests per second",
      section: "capacity",
      default: 100,
      min: 1,
      max: 100_000,
      scale: "log",
      unit: "/s",
    },
  },
  connections: { incoming: false, outgoing: ["service", "database"] },
};

export const testService: ComponentDefinition = {
  type: "service",
  category: "compute",
  displayName: "Service",
  description: "Runs your application code.",
  modelNote: "A fixed number of workers, each handling one request at a time.",
  icon: "cube",
  params: {
    workers: {
      kind: "number",
      label: "Workers",
      section: "capacity",
      default: 8,
      min: 1,
      max: 1024,
      step: 1,
      scale: "log",
    },
    balancing: {
      kind: "choice",
      label: "Balancing",
      section: "behaviour",
      default: "round-robin",
      options: [
        { value: "round-robin", label: "Round robin" },
        { value: "least-connections", label: "Least connections" },
      ],
    },
    retries: { kind: "toggle", label: "Retry on failure", section: "failure", default: false },
  },
  connections: { incoming: true, outgoing: ["database"] },
};

export const testDatabase: ComponentDefinition = {
  type: "database",
  category: "data",
  displayName: "Database",
  description: "Stores your data.",
  modelNote: "A limited number of connections, each running one query at a time.",
  icon: "database",
  params: {},
  connections: { incoming: true, outgoing: [] },
};

export const testDefinitions = [testClient, testService, testDatabase];
