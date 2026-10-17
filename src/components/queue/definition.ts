import type { ComponentDefinition } from "../../model/component.ts";

export const queue: ComponentDefinition = {
  type: "queue",
  category: "messaging",
  displayName: "Queue",
  description: "Holds jobs until a worker is free, so slow work doesn't block requests.",
  modelNote:
    "Adding a job is quick and answers the sender straight away; the work happens later. " +
    "Connected workers pull jobs in order as they free up. " +
    "When the queue is full, new jobs are rejected. Failed jobs can be put back to try again.",
  icon: "stack",
  params: {
    capacity: {
      kind: "number",
      label: "Max jobs",
      section: "capacity",
      help: "When this many are waiting, new jobs are rejected.",
      default: 100_000,
      min: 10,
      max: 10_000_000,
      step: 1,
      scale: "log",
    },
    enqueueTime: {
      kind: "number",
      label: "Time to add a job",
      section: "behaviour",
      default: 2,
      min: 0.1,
      max: 100,
      scale: "log",
      unit: "ms",
    },
    redeliver: {
      kind: "toggle",
      label: "Retry failed jobs",
      section: "failure",
      help: "Put a job back on the queue when a worker fails it.",
      default: true,
    },
  },
  connections: {
    incoming: true,
    outgoing: ["worker"],
  },
};
