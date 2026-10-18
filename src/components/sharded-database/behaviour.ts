import { NodeRecorder } from "../../engine/metrics/recorder.ts";
import { QueueingServer, type ServerRecorder } from "../../engine/runtime/server.ts";
import type { BehaviourFactory, Request } from "../../engine/runtime/types.ts";
import { workTime } from "../../engine/runtime/workTime.ts";

type Settings = {
  shards: number;
  connections: number;
  spread: "hash" | "range";
  keyRange: number;
  readTime: number;
  writeTime: number;
  searchTime: number;
  maxWaiting: number;
  errorRate: number;
};

/** A cheap integer hash, so neighbouring keys land on different shards. */
function hash(key: number): number {
  let h = Math.imul(key ^ (key >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Shards, each a database of its own (a queueing server with its own
 * connections and line). The key picks the shard. Each shard reports to
 * the component's recorder (arrivals, completions, drops, total waiting)
 * and to its own, for its utilization; the component's utilization is its
 * busiest shard's. Writes go on to replicas and search indexes, as a
 * database's do.
 */
export const shardedDatabase: BehaviourFactory = ({ sim, rng, recorder, node, send }) => {
  const params = () => node.params as Settings;
  const replicate = () => {};

  type Shard = { server: QueueingServer; own: NodeRecorder; busy: number; waiting: number };
  let shards: Shard[] = [];

  const makeShard = (): Shard => {
    const own = new NodeRecorder();
    const shard: Shard = { server: null as unknown as QueueingServer, own, busy: 0, waiting: 0 };
    const report: ServerRecorder = {
      arrive: (time, weight) => {
        recorder.arrive(time, weight);
        own.arrive(time, weight);
      },
      complete: (time, latency, ok, weight) => {
        recorder.complete(time, latency, ok, weight);
        own.complete(time, latency, ok, weight);
      },
      drop: (time, weight) => {
        recorder.drop(time, weight);
        own.drop(time, weight);
      },
      setBusy: (time, busy, capacity) => {
        own.setBusy(time, busy, capacity);
        shard.busy = busy;
        // The component is as busy as its busiest shard.
        recorder.setBusy(time, Math.max(...shards.map((s) => s.busy)), capacity);
      },
      setWaiting: (waiting) => {
        shard.waiting = waiting;
        recorder.setWaiting(shards.reduce((sum, s) => sum + s.waiting, 0));
      },
    };
    shard.server = new QueueingServer(sim, report, {
      get concurrency() {
        return params().connections;
      },
      get maxWaiting() {
        return params().maxWaiting;
      },
      work: (request, done, stretch) => {
        const { readTime, writeTime, searchTime, errorRate } = params();
        const mean =
          request.kind === "write" ? writeTime : request.kind === "search" ? searchTime : readTime;
        sim.schedule(workTime(rng, mean) * stretch, () => {
          if (rng.next() < errorRate / 100) {
            done({ ok: false, reason: "error" });
            return;
          }
          if (request.kind === "write") {
            for (const replica of node.routes.replicas)
              send(replica, { ...request, op: "replicate" }, replicate);
            for (const index of node.routes.search)
              send(index, { ...request, op: "index" }, replicate);
          }
          done({ ok: true });
        });
      },
    });
    return shard;
  };

  /** Shards follow the setting live: more are added, extra ones finish what they hold. */
  const shardFor = (request: Request): Shard => {
    const { shards: count, spread, keyRange } = params();
    while (shards.length < count) shards.push(makeShard());
    if (shards.length > count) shards = shards.slice(0, count);
    const index =
      spread === "range"
        ? Math.min(count - 1, Math.floor((request.key * count) / Math.max(1, keyRange)))
        : hash(request.key) % count;
    return shards[index] as Shard;
  };

  recorder.reportShards((now) => shards.map((s) => s.own.snapshot(now).utilization));
  shards = Array.from({ length: params().shards }, makeShard);

  return { handle: (request, reply) => shardFor(request).server.handle(request, reply) };
};
