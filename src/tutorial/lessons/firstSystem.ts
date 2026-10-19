import { cardOf, type Lesson, nodeOfType, type TutorialContext } from "../lesson.ts";

/*
 * "Your first system": build a client and a service, run it, read the
 * numbers, break it, fix it, and see what the fix costs. The numbers quoted
 * are what this system does with default settings and the default seed
 * (tutorial.test.ts checks every step can be done, and that they hold).
 */

const client = (c: TutorialContext) => nodeOfType(c.doc, "client");
const service = (c: TutorialContext) => nodeOfType(c.doc, "service");
const errors = (c: TutorialContext) => c.snapshot?.system.errorRate ?? 0;

export const firstSystem: Lesson = {
  id: "first-system",
  title: "Your first system",
  summary:
    "Build a tiny system, send it traffic, break it and fix it, reading the numbers as you go.",
  systemName: "My first system",
  steps: [
    {
      id: "welcome",
      title: "Your first system",
      body: [
        "In about five minutes you'll build a tiny system, send it traffic, break it and fix it, and learn to read the numbers that tell you what's going on.",
        "This card says what to do next, and moves on by itself once you've done it.",
      ],
    },
    {
      id: "add-client",
      title: "Add your users",
      body: [
        "A Client stands for the people using your system. It sends requests and waits for the answers.",
        "Click Client in the Components panel on the left.",
      ],
      target: '[data-palette-type="client"]',
      done: (c) => client(c) !== undefined,
    },
    {
      id: "add-service",
      title: "Add a service",
      body: [
        "A Service runs your code: it takes each request, does some work, and answers.",
        "Click Service in the Components panel.",
      ],
      target: '[data-palette-type="service"]',
      done: (c) => service(c) !== undefined,
    },
    {
      id: "connect",
      title: "Connect them",
      body: [
        "Requests travel along connections, from left to right. Drag Service to the right of Client if it isn't already.",
        "Then drag from the small dot on the right edge of Client and drop it on Service.",
      ],
      target: (c) => cardOf(client(c)),
      done: (c) => {
        const from = client(c);
        const to = service(c);
        return (
          !!from && !!to && c.doc.edges.some((e) => e.source === from.id && e.target === to.id)
        );
      },
    },
    {
      id: "run",
      title: "Send some traffic",
      body: ["Press Space, or Run at the top. The client starts sending 100 requests a second."],
      target: "[data-run-button]",
      done: (c) => c.running,
    },
    {
      id: "throughput",
      title: "Throughput: answers per second",
      body: [
        "At the bottom, throughput counts the answers coming back each second. It climbs to about 100: everything the client sends is being answered.",
      ],
      target: '[data-vital="throughput"]',
      explain: "throughput",
    },
    {
      id: "p99",
      title: "p99: how slow are the slow ones?",
      body: [
        "p99 means 99 of every 100 requests finished faster than this. Here it's around 100 ms: quick.",
        "It's the speed number to watch. An average hides the slow requests, and those are the ones people notice.",
      ],
      target: '[data-vital="p99"]',
      explain: "p99",
    },
    {
      id: "select-service",
      title: "Look inside the service",
      body: ["Click Service on the canvas. The inspector on the right shows its own numbers."],
      target: (c) => cardOf(service(c)),
      done: (c) => {
        const s = service(c);
        return !!s && c.selected.includes(s.id);
      },
    },
    {
      id: "busy",
      title: "Busy: how full it is",
      body: [
        "Busy is about 11%. The service handles 16 requests at once, each taking about 20 ms, so 100 a second barely fills it.",
        "That gives its capacity: 16 ÷ 20 ms is about 800 requests a second.",
      ],
      target: '[data-stat="Busy"]',
      explain: "busy",
    },
    {
      id: "push",
      title: "Send ten times the traffic",
      body: [
        "Click Client and set Requests per second to 1000: more than the 800 the service can do.",
      ],
      target: (c) => cardOf(client(c)),
      done: (c) => Number(client(c)?.params.rate ?? 0) >= 900,
    },
    {
      id: "break",
      title: "Watch it break",
      body: [
        "Keep an eye on the bottom of the screen for a few seconds.",
        "The service is full, so requests wait in line. p99 climbs to a whole second, then errors appear: after its 1 second timeout, the client gives up.",
      ],
      target: '[aria-label="System vitals"]',
      done: (c) => errors(c) >= 0.5,
      explain: "waiting",
    },
    {
      id: "failed",
      title: "Slow became failed",
      body: [
        "Every request now waits more than a second, so the client gives up on nearly all of them.",
        "Throughput still shows about 1,000: it counts answers, failed or not. And the note above the numbers names the problem: the service can't take on any more requests.",
      ],
      target: "[data-insight-note]",
      explain: "errors",
    },
    {
      id: "fix",
      title: "Fix it: give it more room",
      body: [
        "Click Service and set Requests at once to 64. That's room for about 3,200 requests a second.",
      ],
      target: (c) => cardOf(service(c)),
      done: (c) => Number(service(c)?.params.concurrency ?? 0) >= 64,
    },
    {
      id: "recover",
      title: "Back to healthy",
      body: [
        "Give it a few seconds. The line drains, errors drop to 0% and p99 comes back down.",
        "Busy settles around 30%: plenty of room to spare.",
      ],
      target: '[aria-label="System vitals"]',
      done: (c) => c.running && errors(c) < 0.005 && (c.snapshot?.system.latency?.p99 ?? 0) < 300,
    },
    {
      id: "cost",
      title: "Every fix has a price",
      body: [
        "est. cost at the bottom is a rough monthly bill. With Service selected, Estimated cost in the inspector shows its machine went from 1 vCPU to 2.",
        "Most of the total is sending answers to users, which grows with traffic. Click empty canvas to see the cost of each part.",
      ],
      target: '[data-vital="est. cost"]',
      explain: "cost",
    },
    {
      id: "done",
      title: "You're reading the numbers",
      body: [
        "Throughput, p99, busy, waiting in line and errors: those five tell you most of what's happening in any system.",
        "Next, open a blueprint from the systems library: each breaks in a different way. Click any dotted label to see what it means.",
      ],
    },
  ],
};

export const LESSONS: readonly Lesson[] = [firstSystem];

export function findLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
