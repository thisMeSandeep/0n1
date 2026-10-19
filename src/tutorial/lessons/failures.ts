import {
  cardOf,
  errorsOf,
  type Lesson,
  nodeById,
  TARGETS,
  type TutorialContext,
} from "../lesson.ts";

/*
 * "When a part fails": take components of the URL shortener down, one with
 * a twin behind the load balancer and one without, and see what users
 * notice. Numbers are what the blueprint does (tutorial.test.ts checks them).
 */

const isDown = (c: TutorialContext, id: string) => c.snapshot?.nodes[id]?.down === true;

export const failures: Lesson = {
  id: "failures",
  title: "When a part fails",
  summary:
    "Take parts of a system down, and see which failures users notice: redundancy and single points of failure.",
  minutes: 4,
  start: { blueprint: "url-shortener" },
  steps: [
    {
      id: "welcome",
      title: "When a part fails",
      body: [
        "Machines crash and networks drop. Here you'll take parts of the URL shortener down, and see which failures its users notice.",
      ],
    },
    {
      id: "run",
      title: "Start it",
      body: ["Press Space. Everything is healthy at 200 requests a second."],
      target: TARGETS.run,
      done: (c) => c.running,
    },
    {
      id: "down-api",
      title: "Take a service down",
      body: ["Click Shortener API · 1 and press K, or right-click it and choose Take down."],
      target: (c) => cardOf(nodeById(c.doc, "api-1")),
      done: (c) => isDown(c, "api-1"),
    },
    {
      id: "carry-on",
      title: "Hardly anyone notices",
      body: [
        "A handful of requests that were inside it fail, and that's all. The load balancer sends everything to API 2 instead, which has plenty of room.",
        "With two of something, either one can fail.",
      ],
      target: TARGETS.vitals,
    },
    {
      id: "down-db",
      title: "Now the database",
      body: ["Click Links DB and press K."],
      target: (c) => cardOf(nodeById(c.doc, "db")),
      done: (c) => isDown(c, "db"),
    },
    {
      id: "everything-fails",
      title: "Everything fails",
      body: [
        "Within a few seconds errors reach 100%. Every request needs Links DB, and there's only one: a single point of failure.",
      ],
      target: TARGETS.vitals,
      done: (c) => errorsOf(c) >= 0.9,
      explain: "errors",
    },
    {
      id: "note",
      title: "0n1 says what's wrong",
      body: [
        "The note above the numbers names the cause: Links DB is down. When many things look broken at once, look for what they all depend on.",
      ],
      target: TARGETS.insight,
      explain: "insights",
    },
    {
      id: "back-db",
      title: "Bring it back",
      body: ["With Links DB selected, press K again."],
      target: (c) => cardOf(nodeById(c.doc, "db")),
      done: (c) => c.snapshot !== null && !isDown(c, "db"),
    },
    {
      id: "recovered",
      title: "Recovered",
      body: [
        "Errors fall back to 0% within a few seconds. API 1 is still down; you can bring it back the same way.",
      ],
      target: TARGETS.vitals,
      done: (c) => c.running && errorsOf(c) < 0.005,
    },
    {
      id: "done",
      title: "Spread the risk",
      body: [
        "Have two of anything whose failure would stop everything, with something to switch between them, like the load balancer here.",
        "The chaos timeline (the clock icon in the top bar) can schedule failures for you. Next: reading a trace.",
      ],
    },
  ],
};
