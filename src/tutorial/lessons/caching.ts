import {
  cardOf,
  connected,
  errorsOf,
  healthy,
  type Lesson,
  nodeById,
  nodeOfType,
  TARGETS,
  type TutorialContext,
} from "../lesson.ts";

/*
 * "Caching": overload the URL shortener's database, rescue it with a cache,
 * then see why it only works when some keys are more popular than others.
 * Numbers are what the blueprint does (tutorial.test.ts checks them).
 */

const db = (c: TutorialContext) => nodeById(c.doc, "db");
const cache = (c: TutorialContext) => nodeOfType(c.doc, "cache");
const dbBusy = (c: TutorialContext) => c.snapshot?.nodes.db?.utilization ?? 0;

export const caching: Lesson = {
  id: "caching",
  title: "Caching: give the database a break",
  summary:
    "Overload a database, rescue it with a cache, and see why popular data is what makes caching work.",
  minutes: 5,
  start: { blueprint: "url-shortener" },
  steps: [
    {
      id: "welcome",
      title: "Caching",
      body: [
        "This is the URL shortener: people open short links, and two services look each one up in Links DB. Nearly every request is a read, and a few links are far more popular than the rest.",
        "You'll overload the database, then fix it with a cache.",
      ],
    },
    {
      id: "run",
      title: "Start it",
      body: ["Press Space, or Run at the top. Users send 200 requests a second."],
      target: TARGETS.run,
      done: (c) => c.running,
    },
    {
      id: "select-db",
      title: "Look at the database",
      body: ["Click Links DB on the canvas."],
      target: (c) => cardOf(db(c)),
      done: (c) => c.selected.includes("db"),
    },
    {
      id: "db-busy",
      title: "Busy, but coping",
      body: [
        "Links DB is about 26% busy. It has 8 connections and each read takes about 10 ms, so it can do roughly 800 reads a second.",
      ],
      target: TARGETS.stat("Busy"),
      explain: "busy",
    },
    {
      id: "traffic",
      title: "Five times the traffic",
      body: ["Open Traffic in the top bar and choose 500%: about 1,000 requests a second."],
      target: TARGETS.traffic,
      done: (c) => c.traffic >= 5,
    },
    {
      id: "melt",
      title: "The database melts",
      body: [
        "Links DB is 100% busy. About 240 requests wait in line for a connection, p99 climbs to the 2 second timeout, and then requests start failing.",
        "Give it ten seconds or so.",
      ],
      target: TARGETS.vitals,
      done: (c) => errorsOf(c) >= 0.5,
      explain: "waiting",
    },
    {
      id: "add-cache",
      title: "Add a cache",
      body: [
        "A cache keeps answers in memory, so repeated reads don't reach the database. Click Cache in the Components panel (under Data).",
      ],
      target: TARGETS.palette("cache"),
      done: (c) => cache(c) !== undefined,
    },
    {
      id: "connect-cache",
      title: "Connect both services to it",
      body: [
        "Drag from the right edge of Shortener API · 1 onto Cache, then the same from Shortener API · 2.",
        "Changing the system restarts the run, still at 500%.",
      ],
      target: (c) => cardOf(cache(c)),
      done: (c) => {
        const id = cache(c)?.id;
        return connected(c.doc, "api-1", id) && connected(c.doc, "api-2", id);
      },
    },
    {
      id: "rescued",
      title: "Rescued",
      body: [
        "Give it a few seconds. At the same 500% traffic, errors stay at 0% and p99 is down to about 60 ms.",
      ],
      target: TARGETS.vitals,
      done: healthy,
    },
    {
      id: "select-cache",
      title: "Why it works",
      body: ["Click Cache on the canvas."],
      target: (c) => cardOf(cache(c)),
      done: (c) => {
        const id = cache(c)?.id;
        return !!id && c.selected.includes(id);
      },
    },
    {
      id: "hit-ratio",
      title: "Hit ratio",
      body: [
        "The hit ratio is the share of lookups the cache answers itself. It climbs past 60%: only the misses reach Links DB, which is back to about 60% busy.",
      ],
      target: TARGETS.stat("Hit ratio"),
      explain: "hit-ratio",
    },
    {
      id: "uniform",
      title: "What if nothing is popular?",
      body: ["Click Users and set Key popularity to Every key equally likely."],
      target: (c) => cardOf(nodeById(c.doc, "users")),
      done: (c) => nodeById(c.doc, "users")?.params.keyPopularity === "uniform",
    },
    {
      id: "melt-again",
      title: "The cache stops helping",
      body: [
        "The hit ratio falls to about 10%. The cache holds 10,000 of the 100,000 links, and now any link is as likely as another, so most reads miss and Links DB is overloaded again.",
      ],
      target: (c) => cardOf(db(c)),
      done: (c) => dbBusy(c) >= 0.95,
      explain: "hit-ratio",
    },
    {
      id: "done",
      title: "When caching works",
      body: [
        "A cache helps when the same things are asked for again and again, which real traffic usually does. Its hit ratio tells you how much.",
        "When the problem is writes, a cache can't help. That's the next lesson: queues.",
      ],
    },
  ],
};
