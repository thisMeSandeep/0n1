import { slotsFor } from "../../engine/runtime/server.ts";
import type { BehaviourFactory, Request } from "../../engine/runtime/types.ts";
import { MAX_DELIVERIES } from "../queue/behaviour.ts";

type Message = { request: Request; publishedAt: number; deliveries: number };

/** One subscriber's copy of the stream: its own backlog, and the slots it has free. */
type Subscription = {
  id: string;
  /** Slots it can take messages into; a queue takes them at once (Infinity). */
  concurrency: number;
  free: number;
  messages: Message[];
  head: number;
  /** Real messages waiting (sum of weights). */
  depth: number;
};

/**
 * Accepts a message after its publish time and answers the publisher
 * straight away. Every subscriber gets its own copy in its own backlog, and
 * each backlog is handed out like a queue's (see queue/behaviour.ts): a
 * worker only gets as many as it has free slots for, so one slow
 * subscriber's backlog grows while the others keep up. A queue subscribing
 * takes messages as they come and keeps its own backlog. Depth and capacity
 * count real messages, so sampled ones (S26) count by their weight. A
 * pub/sub that is taken down comes back empty.
 */
export const pubsub: BehaviourFactory = ({ sim, node, recorder, send, peer, isUp }) => {
  const params = () => node.params as { capacity: number; publishTime: number; redeliver: boolean };
  const concurrencyOf = (id: string) => {
    const subscriber = peer(id);
    return subscriber?.type === "queue"
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Number(subscriber?.params.concurrency ?? 1));
  };
  const subscriptions: Subscription[] = node.targets.map((id) => {
    const concurrency = concurrencyOf(id);
    return { id, concurrency, free: concurrency, messages: [], head: 0, depth: 0 };
  });
  let processing = 0;

  const oldestOf = (s: Subscription) =>
    s.head < s.messages.length ? (s.messages[s.head] as Message).publishedAt : null;

  const report = () => {
    let total = 0;
    let fullest = 0;
    let oldest: number | null = null;
    for (const s of subscriptions) {
      total += s.depth;
      fullest = Math.max(fullest, s.depth);
      const since = oldestOf(s);
      if (since !== null && (oldest === null || since < oldest)) oldest = since;
    }
    // Full means the fullest backlog: that's the one that starts losing messages.
    recorder.setBusy(sim.now, fullest, params().capacity);
    recorder.setInFlight(processing);
    recorder.setWaiting(total);
    recorder.setOldest(oldest);
  };
  recorder.reportSubscriptions((now) =>
    subscriptions.map((s) => {
      const since = oldestOf(s);
      return { node: s.id, waiting: s.depth, oldestAge: since === null ? null : now - since };
    }),
  );

  const push = (s: Subscription, message: Message) => {
    s.messages.push(message);
    s.depth += message.request.weight;
  };

  const takeNext = (s: Subscription): Message => {
    const message = s.messages[s.head] as Message;
    s.head++;
    s.depth -= message.request.weight;
    if (s.head > 1024 && s.head * 2 > s.messages.length) {
      s.messages = s.messages.slice(s.head);
      s.head = 0;
    }
    return message;
  };

  const dispatch = (s: Subscription) => {
    while (s.head < s.messages.length && s.free >= 1 && isUp(s.id)) {
      const message = takeNext(s);
      // Matches what the worker's own server will take (see slotsFor).
      const slots = slotsFor(message.request.weight, s.free).slots;
      s.free -= slots;
      processing += message.request.weight;
      send(s.id, message.request, (outcome) => {
        s.free += slots;
        processing -= message.request.weight;
        if (outcome.ok) finish(message, true);
        else if (params().redeliver && message.deliveries < MAX_DELIVERIES) {
          message.deliveries++;
          push(s, message);
        } else finish(message, false);
        dispatch(s);
      });
    }
    report();
  };

  const finish = (message: Message, ok: boolean) =>
    recorder.complete(sim.now, sim.now - message.publishedAt, ok, message.request.weight);

  report();
  return {
    onPeerChange(id) {
      // A worker's "Jobs at once" changed while running.
      const s = subscriptions.find((sub) => sub.id === id);
      if (!s) return;
      const concurrency = concurrencyOf(id);
      if (concurrency === s.concurrency) return;
      s.free += concurrency - s.concurrency;
      s.concurrency = concurrency;
      dispatch(s);
    },
    onPeerStatus(id, up) {
      const s = subscriptions.find((sub) => sub.id === id);
      if (!s || !up) return; // a subscriber going down fails its messages back to us
      s.free = s.concurrency; // it came back fresh
      dispatch(s);
    },
    handle(request, reply) {
      recorder.arrive(sim.now, request.weight);
      sim.schedule(params().publishTime, () => {
        for (const s of subscriptions) {
          if (s.depth + request.weight > params().capacity) {
            recorder.drop(sim.now, request.weight); // this subscriber loses it
            continue;
          }
          push(s, {
            // Each subscriber's copy travels on its own.
            request: { ...request, op: undefined, path: [...request.path] },
            publishedAt: sim.now,
            deliveries: 1,
          });
        }
        reply({ ok: true });
        for (const s of subscriptions) dispatch(s);
      });
    },
  };
};
