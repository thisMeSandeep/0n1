import {
  cardOf,
  connected,
  errorsOf,
  healthy,
  type Lesson,
  nodeOfType,
  TARGETS,
  type TutorialContext,
} from "../lesson.ts";

/*
 * "Queues": the write-heavy blueprint swamps its primary database; a queue
 * and a worker turn the overload into a backlog that drains later.
 * Numbers are what the blueprint does (tutorial.test.ts checks them).
 */

const queue = (c: TutorialContext) => nodeOfType(c.doc, "queue");
const worker = (c: TutorialContext) => nodeOfType(c.doc, "worker");
const backlog = (c: TutorialContext) => {
  const id = queue(c)?.id;
  return id ? (c.snapshot?.nodes[id]?.waiting ?? 0) : 0;
};

export const queues: Lesson = {
  id: "queues",
  title: "Queues: absorb a flood of writes",
  summary:
    "Writes swamp a database. Put a queue in front, and errors turn into a backlog that clears later.",
  minutes: 6,
  start: { blueprint: "write-heavy" },
  steps: [
    {
      id: "welcome",
      title: "Queues",
      body: [
        "An activity app: four requests in five are writes, like likes and check-ins. Reads go to a replica, Feeds DB, but every write has to go to Primary DB.",
        "You'll swamp it with writes, then let a queue take the strain.",
      ],
    },
    {
      id: "run",
      title: "Start it",
      body: ["Press Space. At 300 requests a second, Primary DB is busy but copes."],
      target: TARGETS.run,
      done: (c) => c.running,
    },
    {
      id: "traffic",
      title: "Double the traffic",
      body: ["Open Traffic in the top bar and choose 200%."],
      target: TARGETS.traffic,
      done: (c) => c.traffic >= 2,
    },
    {
      id: "melt",
      title: "Too many writes",
      body: [
        "Primary DB can't write fast enough. Requests wait in line, p99 climbs to the 2 second timeout, and then most requests fail. This takes ten or fifteen seconds.",
        "A cache or a replica wouldn't help here: they're for reads.",
      ],
      target: TARGETS.vitals,
      done: (c) => errorsOf(c) >= 0.5,
      explain: "errors",
    },
    {
      id: "add-queue",
      title: "Add a queue",
      body: [
        "A queue holds work until something is free to do it. Click Queue in the Components panel (under Messaging).",
      ],
      target: TARGETS.palette("queue"),
      done: (c) => queue(c) !== undefined,
    },
    {
      id: "add-worker",
      title: "Add a worker",
      body: ["A worker takes jobs off the queue and does them. Click Worker (under Compute)."],
      target: TARGETS.palette("worker"),
      done: (c) => worker(c) !== undefined,
    },
    {
      id: "wire",
      title: "Wire it up",
      body: [
        "Connect both services to Queue, Queue to Worker, and Worker to Primary DB. Writes will now go on the queue, and the worker writes them to the database.",
      ],
      target: (c) => cardOf(queue(c)),
      done: (c) => {
        const q = queue(c)?.id;
        const w = worker(c)?.id;
        return (
          connected(c.doc, "api-1", q) &&
          connected(c.doc, "api-2", q) &&
          connected(c.doc, q, w) &&
          connected(c.doc, w, "primary")
        );
      },
    },
    {
      id: "pace",
      title: "Set the worker's pace",
      body: [
        "Click Worker and set Jobs at once to 7 and Work per job to 1 ms. It then passes writes to Primary DB as fast as its 8 connections allow, and never more.",
      ],
      target: (c) => cardOf(worker(c)),
      done: (c) => {
        const p = worker(c)?.params;
        const jobs = Number(p?.concurrency ?? 0);
        return jobs >= 4 && jobs <= 8 && Number(p?.workTime ?? 99) <= 5;
      },
    },
    {
      id: "answered",
      title: "Answered at once",
      body: [
        "Give it a few seconds. At the same 200% traffic, errors are at 0% and p99 is about 35 ms: putting a write on a queue is quick, so users get their answer straight away.",
      ],
      target: TARGETS.vitals,
      done: healthy,
    },
    {
      id: "select-queue",
      title: "But the work is still waiting",
      body: ["Click Queue on the canvas."],
      target: (c) => cardOf(queue(c)),
      done: (c) => {
        const id = queue(c)?.id;
        return !!id && c.selected.includes(id);
      },
    },
    {
      id: "backlog",
      title: "The backlog",
      body: [
        "Waiting keeps growing, by about 180 jobs a second: writes arrive faster than Primary DB can take them, so they queue up. Oldest job (in Details) shows how late they are.",
      ],
      target: TARGETS.stat("Waiting"),
      explain: "backlog",
    },
    {
      id: "calm",
      title: "Let the rush pass",
      body: ["Set Traffic back to 100%, as if the rush were over."],
      target: TARGETS.traffic,
      done: (c) => c.traffic <= 1,
    },
    {
      id: "drain",
      title: "Catching up",
      body: [
        "Writes now arrive slower than the worker clears them, so Waiting falls. It's empty in about a minute.",
      ],
      target: TARGETS.stat("Waiting"),
      done: (c) => backlog(c) < 50,
    },
    {
      id: "done",
      title: "When queues work",
      body: [
        "A queue turns “too much work right now” into “a backlog that clears later”. Users don't wait, but the work happens late, so it suits things nobody needs done this instant.",
        "Next: what happens when a part of the system fails.",
      ],
    },
  ],
};
