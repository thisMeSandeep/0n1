/*
 * Beginner-friendly explanations for the performance numbers shown by 0n1.
 *
 * The glossary entries explain what each number means, why it matters,
 * and what changes can make it increase or decrease.
 *
 * The thresholds mentioned here should match the colours used by
 * simulation/live.ts.
 */

export type GlossaryGroup =
  | "Traffic"
  | "Speed"
  | "Health"
  | "Data"
  | "Cost"
  | "Reading a run";

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
  /** A short explanation of the term. */
  what: string;
  /** Why this number is useful. */
  why: string;
  /** What a normal value looks like, and when to investigate. */
  healthy?: string;
  /** What can cause the number to increase or decrease. */
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
    what: "The number of requests the system completes each second. This includes requests that succeed and requests that fail.",
    why: "This shows how much work the system completes. If fewer requests are completed than arrive, the remaining requests may have to wait or may be rejected.",
    healthy:
      "It is usually close to the number of requests being sent, provided the system can handle the load. For the whole system, it represents the responses users receive each second. For one component, it shows how many requests that component completes each second.",
    moves:
      "It usually increases when more requests arrive, until a component reaches its limit. After that, the number completed may stop increasing, while more requests wait or fail.",
  },
  {
    id: "sent",
    term: "Sent",
    group: "Traffic",
    what: "The number of requests clients send to the system each second.",
    why: "This is the amount of work the test sends to the system. In a real website, users may continue sending requests even when the website is slow. The simulator can represent this situation too.",
    moves:
      "It depends on the client's Requests per second setting, the traffic pattern, the Traffic % control at the top, and any traffic increases added to the timeline.",
  },
  {
    id: "p99",
    term: "p99",
    group: "Speed",
    what: "The time within which 99% of requests finish. The slowest 1% take longer than this time.",
    why: "An average can look good even when some requests are very slow. A webpage may make many requests, so slow requests can affect users even when most requests finish quickly.",
    healthy:
      "A response time below about 200 ms may feel very fast to users, though the result depends on the task. The summary bar turns amber at 500 ms and red at 1 second. If p99 approaches the client's timeout limit, some requests may fail because they take too long.",
    moves:
      "It increases when requests wait in a line, when a component takes longer to process them, when calls are made one after another instead of at the same time, or when requests are tried again after failures.",
  },
  {
    id: "percentiles",
    term: "p50 and p95",
    group: "Speed",
    what: "p50 is the time within which 50% of requests finish. p95 is the time within which 95% of requests finish.",
    why: "Looking at p50, p95 and p99 together helps show whether most requests are fast while a smaller number are slow. For example, a low p50 and a much higher p99 mean that some requests take much longer than a typical request.",
    moves:
      "p50 changes when the usual processing time changes. p95 and p99 often increase when requests start waiting in lines.",
  },
  {
    id: "errors",
    term: "Errors",
    group: "Health",
    what: "The percentage of requests that fail. A request is counted as failed if a component rejects it, returns an error, or the client stops waiting because the timeout limit has been reached.",
    why: "A failed request means the user did not receive a successful result. This number shows the failure rate experienced by users, regardless of where the problem started.",
    healthy:
      "The target is 0%. The summary bar turns amber at 0.5% and red at 5%.",
    moves:
      "It increases when waiting lines fill up, components stop working, a component is configured to return errors, or requests take so long that clients stop waiting.",
  },
  {
    id: "failed-here",
    term: "Failed here",
    group: "Health",
    what: "The number of failures that start at this component. These happen when the component returns an error or rejects a request. This number does not include failures that started in another component it depends on.",
    why: "It helps identify where a problem starts. For example, if a database fails, the service using that database may also return failed responses. The service's 'Failed here' number can still be 0 if the service itself did not cause the failure.",
    moves:
      "It increases when the component's own error rate increases, its waiting line becomes full, or the component is taken offline.",
  },
  {
    id: "turned-away",
    term: "Turned away",
    group: "Health",
    what: "The number of requests a component rejects immediately. This can happen when its waiting line is full or a rate limit does not allow the request.",
    why: "Rejecting a request quickly can prevent the component from becoming even more overloaded. However, the rejected request is still a failure from the user's point of view.",
    moves:
      "It increases when more requests arrive than the component can handle, when the waiting-line limit is low, or when the rate limit allows too few requests.",
  },
  {
    id: "busy",
    term: "Busy",
    group: "Health",
    what: "The percentage of a component's available processing slots that are currently in use. For a service, each slot can handle one request at a time.",
    why: "Requests can start waiting before a component reaches 100% usage. Requests may arrive together, so all slots can be occupied when a new request arrives.",
    healthy:
      "Below 70% is generally a comfortable level in this simulator. The component turns amber at 70% and red at 90%. These are simulator thresholds, not universal limits for every real system.",
    moves:
      "It increases when more requests arrive, each request takes longer to process, or fewer processing slots are available. As a rough estimate, a component with 16 slots that each handle a request in 20 ms can complete about 800 requests per second if all slots remain in use and there is no other delay.",
  },
  {
    id: "waiting",
    term: "Waiting in line",
    group: "Health",
    what: "The number of requests that have arrived at a component but have not started processing because all its slots are in use.",
    why: "The time a request spends waiting adds to its total response time. If the waiting line keeps growing, the component is not completing work as quickly as requests arrive.",
    healthy:
      "A value close to 0 is usually good. A few waiting requests from time to time can be normal. A line that remains large suggests that the component cannot handle the incoming work quickly enough.",
    moves:
      "The line grows when requests arrive faster than they are completed. As a rough estimate, divide the number of requests ahead in the line by the number of requests the component completes per second to estimate the waiting time.",
  },
  {
    id: "in-flight",
    term: "In flight",
    group: "Health",
    what: "The requests a component is currently handling. This includes requests for which the component is waiting for a response from another service or a database.",
    why: "Read this number together with 'Waiting in line'. It shows how many requests are being handled now and how many have not started yet.",
  },
  {
    id: "hit-ratio",
    term: "Hit ratio",
    group: "Data",
    what: "The percentage of lookups answered by a cache or CDN without asking the database or the original server for the data.",
    why: "When a cache answers a request, the database or original server does not need to do that work. A 90% hit ratio means that 9 out of every 10 lookups are answered by the cache.",
    healthy:
      "The suitable value depends on the type of traffic and data. A value of 80–95% can be common when users often request the same items. Below 30%, the cache may provide limited benefit for that workload.",
    moves:
      "It depends on how many items the cache can store, how long each item remains in the cache, and whether users request a small set of popular items or many different items.",
  },
  {
    id: "stale-reads",
    term: "Stale reads",
    group: "Data",
    what: "The number of reads that return old information because a copy of the data, such as a database replica or search index, has not yet received a recent update.",
    why: "Extra copies of data can help a system handle more requests, but those copies may not contain the latest changes. Slightly old information may be acceptable for some features, but not for others, such as showing a newly placed order.",
    moves:
      "It increases when copies take longer to receive updates, when search indexing is delayed, or when many updates affect the same data.",
  },
  {
    id: "oldest-job",
    term: "Oldest job",
    group: "Data",
    what: "How long the job that has been waiting the longest in a queue has been waiting.",
    why: "A queue lets a system process work later instead of immediately. If the oldest job keeps waiting longer, the workers may not be completing jobs as quickly as new jobs arrive.",
    moves:
      "It increases when there are fewer workers, workers take longer to finish jobs, more jobs arrive, or failed jobs are repeatedly tried again.",
  },
  {
    id: "backlog",
    term: "Backlog",
    group: "Data",
    what: "The number of messages or jobs waiting for a worker to process them. In a publish-subscribe system, each subscriber can have its own backlog.",
    why: "A backlog that remains at a manageable level may be normal. If it keeps growing, the system may eventually run out of space or fail to process new work on time.",
    moves:
      "It grows when jobs or messages arrive faster than workers complete them.",
  },
  {
    id: "breaker-state",
    term: "Circuit breaker state",
    group: "Health",
    what: "A circuit breaker has three states. Closed means calls are allowed as usual. Open means calls are stopped immediately instead of being sent to the failing component. Half-open means a small number of test calls are allowed to check whether that component has recovered.",
    why: "Stopping calls temporarily gives a failing component time to recover. It can also prevent repeated calls from increasing the problem.",
    moves:
      "The breaker opens when failures cross its configured limit. After a waiting period, it may allow a few test calls to check whether the component is working again.",
  },
  {
    id: "dns-cached",
    term: "Users with the address cached",
    group: "Data",
    what: "The percentage of users whose systems still have your service's IP address saved from an earlier DNS lookup.",
    why: "DNS converts a domain name, such as example.com, into an IP address. If DNS stops responding, users who still have a valid saved address may continue to connect, while other users may be unable to find the address.",
    moves:
      "During a DNS outage, this percentage falls as saved answers expire. The time an answer can remain saved is controlled by its DNS TTL. Once DNS works again and users can look up the address, the percentage can recover.",
  },
  {
    id: "cost",
    term: "Estimated cost",
    group: "Cost",
    what: "An approximate monthly infrastructure bill based on typical cloud prices. It includes the size of each component and usage such as requests handled and data sent.",
    why: "Adding servers or increasing component capacity can help handle more work, but it also increases cost. This estimate helps compare the approximate cost of different configurations.",
    moves:
      "It increases when components become larger, more components are added, or traffic and data usage increase. Click an empty area of the canvas to see the cost split by component.",
  },
  {
    id: "status",
    term: "Status colours",
    group: "Reading a run",
    what: "Grey means the component is operating normally, amber means it is becoming busy, and red means it is overloaded or failing. A faded card with a dashed outline means the component is offline.",
    why: "The colours help identify which components need attention first.",
  },
  {
    id: "insights",
    term: "What's happening",
    group: "Reading a run",
    what: "Short explanations written by 0n1 about the test. They describe what is wrong, where the problem may be, and what could help.",
    why: "When several components show problems, these explanations help identify the component where the problem may have started.",
  },
  {
    id: "traces",
    term: "Traces",
    group: "Reading a run",
    what: "A trace follows one request as it moves through the system. It records when the request reaches each component, how long it waits, and how long processing takes.",
    why: "Summary numbers can show that requests are slow. A trace helps show which component used the time.",
  },
  {
    id: "sampling",
    term: "Sampling",
    group: "Reading a run",
    what: "When traffic is very high, 0n1 does not simulate every request. It simulates a smaller number of requests and uses them to represent the larger amount of traffic.",
    why: "This helps the simulator handle large tests in a browser. Rates, percentages and costs are intended to remain accurate, while some detailed results may be approximate.",
  },
];

/** Explanations that show how different performance numbers are related. */
export const CONCEPTS: readonly {
  title: string;
  body: string;
}[] = [
  {
    title: "Capacity depends on slots and processing time",
    body: "Think of a component as having a fixed number of slots. Each request uses one slot while it is being processed. If a component can handle 16 requests at the same time and each request takes 20 ms (0.02 seconds), it can complete about 16 ÷ 0.02 = 800 requests per second under these assumptions. If more requests arrive, the extra requests must wait or be rejected.",
  },
  {
    title: "A system can become slow before requests start failing",
    body: "A component does not always go from normal operation to failure immediately. As it becomes busier, new requests are more likely to find all slots in use and must wait. In this simulator, waiting lines and p99 response time can rise quickly when a component is around 70–80% busy. This can happen before the error rate increases.",
  },
  {
    title: "Waiting increases response time",
    body: "A rough estimate of waiting time is the number of requests ahead in the line divided by the number of requests completed per second. For example, if 200 requests are ahead in the line and the component completes 1,000 requests per second, the estimated wait is 200 ÷ 1,000 = 0.2 seconds, or 200 ms. This is an estimate and assumes the completion rate stays the same.",
  },
  {
    title: "A slow request can fail when it reaches the timeout limit",
    body: "A client usually waits only for a configured period. If a request takes longer, the client may stop waiting and report a timeout error. The system may still finish the work after the client has stopped waiting. If the client sends the request again, the extra request can increase the load.",
  },
  {
    title: "Find the component where the problem starts",
    body: "A problem in one component can make other components that depend on it appear slow. For example, if a database is overloaded, a service that waits for the database may also become slow. To find the starting point, check which component is showing a problem and whether the components it calls are also having problems. The 'What's happening' notes are intended to help with this.",
  },
];

const byId = new Map(GLOSSARY.map((entry) => [entry.id, entry]));

export function glossaryEntry(id: GlossaryId): GlossaryEntry {
  return byId.get(id) as GlossaryEntry;
}

/** Maps the labels shown in the inspector to glossary entry IDs. */
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
  if (label.startsWith("Waiting for ")) {
    return "backlog"; // A subscriber's waiting messages or jobs.
  }

  return LABELS[label];
}
