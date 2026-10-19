import { type Lesson, p99Of, TARGETS } from "../lesson.ts";

/*
 * "Reading a trace": follow single requests through the URL shortener, once
 * when all is well and once under load, and see where the time goes.
 * Numbers are what the blueprint does (tutorial.test.ts checks them).
 */

/** Long enough that it can't be a request from before the traffic went up. */
const SLOW_MS = 100;

export const traces: Lesson = {
  id: "traces",
  title: "Reading a trace",
  summary: "Follow single requests through a system, and see where a slow one's time went.",
  minutes: 4,
  start: { blueprint: "url-shortener" },
  steps: [
    {
      id: "welcome",
      title: "Reading a trace",
      body: [
        "The numbers say whether something is slow. A trace follows one request through the system and shows where its time went.",
      ],
    },
    {
      id: "run",
      title: "Start it",
      body: ["Press Space."],
      target: TARGETS.run,
      done: (c) => c.running,
    },
    {
      id: "trace",
      title: "Follow one request",
      body: [
        "Click empty canvas, then Trace a request in the inspector, under Traces. The next request is followed, and its trace opens.",
      ],
      target: "[data-trace-button]",
      done: (c) => c.openTrace !== null,
    },
    {
      id: "read",
      title: "Each hop, in order",
      body: [
        "Each row is a component the request visited: Users, the load balancer, a service, Links DB. A solid bar is time it was being worked on; a thin line is the network, or waiting on the next component.",
        "This one took a few tens of milliseconds, mostly at Links DB reading the link.",
      ],
      target: '[aria-label="Hops"]',
      explain: "traces",
    },
    {
      id: "load",
      title: "Add some load",
      body: [
        "Press the back arrow at the top of the inspector, then open Traffic and choose 400%.",
      ],
      target: TARGETS.traffic,
      done: (c) => c.traffic >= 4,
    },
    {
      id: "slow",
      title: "Getting slow",
      body: [
        "Links DB now gets more reads than its 8 connections can keep up with. Watch p99 climb past a quarter of a second.",
      ],
      target: TARGETS.vital("p99"),
      done: (c) => p99Of(c) >= 250,
    },
    {
      id: "trace-again",
      title: "Follow another",
      body: ["Trace another request, the same way."],
      target: "[data-trace-button]",
      done: (c) =>
        c.openTrace !== null && c.openTrace.finishedAt - c.openTrace.startedAt >= SLOW_MS,
    },
    {
      id: "waiting",
      title: "The wait, not the work",
      body: [
        "This one took hundreds of milliseconds, and nearly all of it is the hatched bar at Links DB: waiting in line for a free connection. The read itself still takes about 10 ms.",
        "That's what a bottleneck looks like: the time goes on waiting, not on working.",
      ],
      target: '[aria-label="Hops"]',
      explain: "waiting",
    },
    {
      id: "done",
      title: "Where to look",
      body: [
        "When something is slow, trace it: the longest bar shows where to look, and hatched means it's waiting for room rather than doing work.",
        "0n1 also keeps the slowest recent request, and a failed one, in the Traces list for you.",
      ],
    },
  ],
};
