/*
 * What 0n1's numbers mean, in plain words: one entry per number, plus the
 * few ideas that tie them together. The ⓘ explanations beside the numbers
 * and the "Reading the numbers" guide both read from here, so they can't
 * drift apart. Thresholds quoted here are the ones the lab colours by
 * (simulation/live.ts).
 */

export type GlossaryGroup = "Traffic" | "Speed" | "Health" | "Data" | "Cost" | "Reading a run";

export const GLOSSARY_GROUPS: readonly GlossaryGroup[] = [
  "Traffic",
  "Speed",
  "Health",
  "Data",
  "Cost",
  "Reading a run",
];

export type GlossaryEntry = {
  id: GlossaryId;
  term: string;
  group: GlossaryGroup;
  /** One sentence: what it is. */
  what: string;
  /** Why anyone should care. */
  why: string;
  /** What good looks like, and when to worry. */
  healthy?: string;
  /** What makes it go up or down. */
  moves?: string;
};

export const GLOSSARY_IDS = [
  "throughput",
  "sent",
  "p99",
  "percentiles",
  "errors",
  "failed-here",
  "turned-away",
  "busy",
  "waiting",
  "in-flight",
  "hit-ratio",
  "stale-reads",
  "oldest-job",
  "backlog",
  "breaker-state",
  "dns-cached",
  "cost",
  "status",
  "insights",
  "traces",
  "sampling",
] as const;
export type GlossaryId = (typeof GLOSSARY_IDS)[number];

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "throughput",
    term: "Throughput",
    group: "Traffic",
    what: "How many requests are finished each second, successfully or not.",
    why: "It's the work the system actually gets through. If it stays below what clients send, requests are piling up somewhere.",
    healthy:
      "Close to what the clients send. On the vitals pill it's what users get back; on a component, what that component finishes.",
    moves:
      "Rises with traffic until something runs out of room, then flattens while the rest waits or fails.",
  },
  {
    id: "sent",
    term: "Sent",
    group: "Traffic",
    what: "Requests per second a client sends into the system.",
    why: "It's the load you're testing with. Real traffic doesn't slow down because your system is struggling, and neither does a client.",
    moves:
      "The client's Requests per second, its traffic shape, the Traffic % control, and surges on the chaos timeline.",
  },
  {
    id: "p99",
    term: "p99",
    group: "Speed",
    what: "99 of every 100 requests finished faster than this. The slowest 1% took longer.",
    why: "Averages hide the slow ones. One page load can make dozens of requests, so most people hit the slowest 1% sooner than you'd think.",
    healthy:
      "Under about 200 ms feels instant. The vitals turn amber from 500 ms and red from 1 s. Near a client's timeout, slow turns into failed.",
    moves:
      "Waiting in line at a busy component, slow work, calls made one after another, and retries.",
  },
  {
    id: "percentiles",
    term: "p50 and p95",
    group: "Speed",
    what: "Half of requests finished faster than p50 (the typical request); 95 in 100 faster than p95.",
    why: "Together with p99 they show the spread. If p50 is fine but p99 is far above it, a few requests are stuck waiting while most fly through.",
    moves:
      "p50 moves with the typical work time; p95 and p99 move first when things start to queue.",
  },
  {
    id: "errors",
    term: "Errors",
    group: "Health",
    what: "The share of requests that failed: turned away, failed by a component, or given up on after the client's timeout.",
    why: "Each one is a user who didn't get an answer. On the vitals pill it's what users see, wherever the failure started.",
    healthy: "0%. The vitals turn amber from 0.5% and red from 5%.",
    moves:
      "Full lines, components taken down, error rates you set, and timeouts when things get slow.",
  },
  {
    id: "failed-here",
    term: "Failed here",
    group: "Health",
    what: "Failures that started at this component: its own errors, or requests it turned away. Not failures it passed on from further down.",
    why: "It tells you where trouble starts. A service whose database is failing shows failed responses, but failed here stays at 0.",
    moves: "The component's error rate, its line filling up, or it being taken down.",
  },
  {
    id: "turned-away",
    term: "Turned away",
    group: "Health",
    what: "Requests refused at the door because the component's waiting line was full, or a rate limit said no.",
    why: "It's the system protecting itself: failing fast is better than making everyone wait forever. But each one is a failed request.",
    moves:
      "More traffic than the component can handle, a short Max waiting in line, or a tight rate limit.",
  },
  {
    id: "busy",
    term: "Busy",
    group: "Health",
    what: "How much of a component's capacity is in use: for a service, the share of its 'requests at once' slots that are working.",
    why: "Waiting starts long before 100%. Requests arrive in bursts, so past about 70% they often find every slot taken.",
    healthy:
      "Below 70% is comfortable. 0n1 marks it amber from 70% and red from 90%, where lines grow fast.",
    moves:
      "More traffic, slower work per request, or fewer slots. Capacity is roughly slots ÷ work time: 16 slots at 20 ms each is about 800 requests a second.",
  },
  {
    id: "waiting",
    term: "Waiting in line",
    group: "Health",
    what: "Requests that have arrived but haven't started, because every slot is taken.",
    why: "Every waiting request adds its wait to its time. A line that keeps growing means the component can't keep up.",
    healthy: "Near 0. A few now and then is normal; a steady line means it's full.",
    moves:
      "Grows when requests arrive faster than they're finished. How long each waits is about the line's length ÷ the throughput.",
  },
  {
    id: "in-flight",
    term: "In flight",
    group: "Health",
    what: "Requests being worked on right now, including any waiting on something this component called.",
    why: "With waiting in line, it shows where requests are sitting at this moment.",
  },
  {
    id: "hit-ratio",
    term: "Hit ratio",
    group: "Data",
    what: "The share of lookups a cache or CDN answered itself, without going to the database or origin behind it.",
    why: "Every hit is work the slower thing behind it doesn't do. A cache at 90% sends a tenth of the reads on.",
    healthy:
      "It depends on the traffic: with a few very popular keys, 80–95% is common. Under 30% the cache isn't pulling its weight.",
    moves:
      "How many keys the cache holds, how long they stay (TTL), and whether clients ask for a few popular keys or all of them equally.",
  },
  {
    id: "stale-reads",
    term: "Stale reads",
    group: "Data",
    what: "Reads from a replica (or searches on an index) that missed a write still on its way there.",
    why: "Copies trade freshness for capacity. Some features can live with slightly old data; others, like a just-placed order, can't.",
    moves: "Longer replication lag or indexing delay, and more writes to popular keys.",
  },
  {
    id: "oldest-job",
    term: "Oldest job",
    group: "Data",
    what: "How long the job that's waited longest in a queue has been waiting.",
    why: "A queue hides slowness from users, but the work is still late. If this keeps growing, workers can't keep up.",
    moves: "Fewer or slower workers, more jobs, or failed jobs being retried.",
  },
  {
    id: "backlog",
    term: "Backlog",
    group: "Data",
    what: "Messages or jobs waiting for a worker. On a pub/sub, each subscriber has its own.",
    why: "A backlog that stays flat is fine; one that grows will eventually fill up and lose work.",
    moves: "Grows when work arrives faster than it's done.",
  },
  {
    id: "breaker-state",
    term: "Circuit breaker state",
    group: "Health",
    what: "Closed: calls go through. Open: calls fail at once without being sent. Half-open: a few test calls check whether things recovered.",
    why: "Failing fast gives a struggling dependency room to recover, and stops a retry storm from spreading.",
    moves: "Opens when failures pass its threshold; tries again after its cool-down.",
  },
  {
    id: "dns-cached",
    term: "Users with the address cached",
    group: "Data",
    what: "The share of a client's users that still have the system's address from DNS.",
    why: "If DNS goes down, these users carry on and the rest can't reach anything. It's why a DNS outage starts slowly, then breaks everything.",
    moves:
      "Falls as answers expire (the DNS's Answer TTL) while DNS is down; back to 100% once it answers again.",
  },
  {
    id: "cost",
    term: "Estimated cost",
    group: "Cost",
    what: "A rough monthly bill at typical cloud list prices: each component's size, plus usage like requests and data sent.",
    why: "'Just add more servers' fixes many problems, at a price. It shows what each fix costs.",
    moves:
      "Bigger components (more connections, more requests at once), more of them, and more traffic. Click empty canvas to see it by component.",
  },
  {
    id: "status",
    term: "Status colours",
    group: "Reading a run",
    what: "Grey is fine, amber is getting busy, red is overloaded or failing, and a dashed, faded card is down.",
    why: "Colour only ever means state, so anything red is worth a look first.",
  },
  {
    id: "insights",
    term: "What's happening",
    group: "Reading a run",
    what: "0n1's notes on the run: what's wrong, where, and what might help, in plain words.",
    why: "When everything turns red at once, they name the real bottleneck rather than everything waiting behind it.",
  },
  {
    id: "traces",
    term: "Traces",
    group: "Reading a run",
    what: "One request followed hop by hop: when it reached each component, how long it waited in line, and how long the work took.",
    why: "Numbers say something is slow; a trace shows where the time went.",
  },
  {
    id: "sampling",
    term: "Sampling",
    group: "Reading a run",
    what: "At very high traffic, 0n1 simulates one request for every few real ones, each standing for the rest.",
    why: "It keeps big runs smooth in a browser. Rates, percentages and costs stay right; only the finest detail is approximate.",
  },
];

/** The ideas that make the numbers make sense together. */
export const CONCEPTS: readonly { title: string; body: string }[] = [
  {
    title: "Capacity is slots ÷ time",
    body: "A component with 16 requests at once, each taking 20 ms, finishes at most 16 ÷ 0.02 s = 800 requests a second. Send more and the rest wait or are turned away.",
  },
  {
    title: "Slow comes before broken",
    body: "As something gets busy, requests start finding every slot taken. Past about 70–80% busy, lines grow quickly and p99 climbs steeply, long before errors appear.",
  },
  {
    title: "Waiting adds up",
    body: "Time in line ≈ requests waiting ÷ throughput. 200 waiting at a component finishing 1,000 a second means about 200 ms of waiting for each new request.",
  },
  {
    title: "Slow becomes failed at the timeout",
    body: "When waiting pushes requests past a client's timeout, it gives up and counts an error, even though the work may still happen. Retries then add more load.",
  },
  {
    title: "Find where it starts",
    body: "Trouble spreads backwards: a full database makes the services calling it look full too. Look for the component that's red while what it calls is fine; the insights do this for you.",
  },
];

const byId = new Map(GLOSSARY.map((entry) => [entry.id, entry]));

export function glossaryEntry(id: GlossaryId): GlossaryEntry {
  return byId.get(id) as GlossaryEntry;
}

/** The entry for a label as the inspector shows it ("Busy", "Hit ratio"…), if there is one. */
const LABELS: Readonly<Record<string, GlossaryId>> = {
  Throughput: "throughput",
  Finishing: "throughput",
  Arriving: "throughput",
  Sent: "sent",
  p99: "p99",
  p50: "percentiles",
  p95: "percentiles",
  Errors: "errors",
  "Failed responses": "errors",
  "Failed here": "failed-here",
  "Turned away": "turned-away",
  "Total turned away": "turned-away",
  "Total arrived": "throughput",
  "Total finished": "throughput",
  "Total failed": "errors",
  Busy: "busy",
  "Busiest shard": "busy",
  "Least busy shard": "busy",
  Full: "backlog",
  Waiting: "waiting",
  "Waiting in line": "waiting",
  "In flight": "in-flight",
  "Hit ratio": "hit-ratio",
  "Stale reads": "stale-reads",
  "Oldest job": "oldest-job",
  State: "breaker-state",
  "Failed fast": "breaker-state",
  "Users with the address cached": "dns-cached",
};

export function explainLabel(label: string): GlossaryId | undefined {
  if (label.startsWith("Waiting for ")) return "backlog"; // a pub/sub subscriber's
  return LABELS[label];
}
