import type { ComponentDefinition } from "../../model/component.ts";

export const pubsub: ComponentDefinition = {
  type: "pubsub",
  category: "messaging",
  displayName: "Pub/sub",
  description: "Sends every message to every subscriber, so one event can start many jobs.",
  modelNote:
    "Services and workers publish each write they make to it. Publishing is quick and answers straight away. " +
    "Every connected worker or queue is a subscriber and gets its own copy, with its own backlog: " +
    "a slow subscriber falls behind without slowing the others. Workers take messages as they free up; queues take them at once. " +
    "When a subscriber's backlog is full, new messages for it are lost. Failed messages can be sent again, up to 5 tries in all. " +
    "Ordering and partitions are not modelled.",
  icon: "broadcast",
  keywords: ["topic", "publish", "subscribe", "fan out", "events", "stream"],
  liveDetail: "waiting",
  params: {
    capacity: {
      kind: "number",
      label: "Max backlog per subscriber",
      section: "capacity",
      help: "When a subscriber has this many waiting, new messages for it are lost.",
      default: 100_000,
      min: 10,
      max: 10_000_000,
      step: 1,
      scale: "log",
    },
    publishTime: {
      kind: "number",
      label: "Time to publish",
      section: "behaviour",
      default: 2,
      min: 0.1,
      max: 100,
      scale: "log",
      unit: "ms",
    },
    redeliver: {
      kind: "toggle",
      label: "Retry failed messages",
      section: "failure",
      help: "Send a message again when a subscriber fails it.",
      default: true,
    },
  },
  connections: {
    incoming: true,
    outgoingRequired: true,
    outgoing: ["worker", "queue"],
  },
};
