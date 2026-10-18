import type { BehaviourContext, Outcome, Request } from "../../engine/runtime/types.ts";

/**
 * A client stands for many users, each with a resolver that caches the
 * system's address. They're modelled as this many groups, each with its own
 * cached answer; requests take turns between them.
 */
export const RESOLVER_GROUPS = 100;

type Group = {
  /** When its answer expires (simulated ms). */
  expiresAt: number;
  /** Requests waiting on a lookup in progress, or null when none is. */
  waiting: ((outcome: Outcome) => void)[] | null;
};

/**
 * Address lookups for a client connected to DNS (S43c). A group with a
 * fresh answer sends at once; otherwise one lookup goes out for the whole
 * group, and requests arriving meanwhile wait for it. A failed lookup is
 * tried at the next DNS, if there's another; when all fail, its requests
 * fail and nothing is cached, so the next request tries again.
 *
 * The run starts warm, as if users had been resolving all along: answers
 * expire evenly over the first TTL. So when DNS goes down, failures start
 * as a trickle and grow until, one TTL later, every request fails.
 *
 * Returns null without DNS, so clients without one run exactly as before.
 */
export function createResolver({
  sim,
  node,
  peer,
  send,
  recorder,
  nextRequestId,
}: Pick<BehaviourContext, "sim" | "node" | "peer" | "send" | "recorder" | "nextRequestId">) {
  const servers = node.routes.dns;
  if (servers.length === 0) return null;
  const ttlMs = (dns: string) => Number(peer(dns)?.params.ttl ?? 60) * 1000;
  const first = ttlMs(servers[0] as string);
  const groups: Group[] = Array.from({ length: RESOLVER_GROUPS }, (_, i) => ({
    expiresAt: sim.now + ((i + 1) / RESOLVER_GROUPS) * first,
    waiting: null,
  }));
  let turn = 0;

  recorder.reportDnsCache(
    (now) => groups.filter((g) => g.expiresAt > now).length / RESOLVER_GROUPS,
  );

  const lookup = (group: Group, index: number, request: Request, tried: number) => {
    const dns = servers[(index + tried) % servers.length] as string;
    const ask: Request = {
      id: nextRequestId(),
      weight: 1, // one lookup, however many requests it stands for
      kind: request.kind,
      key: index,
      createdAt: sim.now,
      attempt: request.attempt,
      path: [node.id],
      op: "resolve",
      ...(request.trace ? { trace: request.trace, span: request.span as number } : {}),
    };
    send(dns, ask, (outcome) => {
      if (!outcome.ok && tried + 1 < servers.length) {
        lookup(group, index, request, tried + 1);
        return;
      }
      if (outcome.ok) group.expiresAt = sim.now + ttlMs(dns);
      const waiting = group.waiting ?? [];
      group.waiting = null;
      for (const resume of waiting) resume(outcome);
    });
  };

  return {
    /** Calls `then` once the request knows where to go, or with why it can't. */
    resolve(request: Request, then: (outcome: Outcome) => void): void {
      const index = turn++ % RESOLVER_GROUPS;
      const group = groups[index] as Group;
      if (group.expiresAt > sim.now) {
        then({ ok: true });
      } else if (group.waiting) {
        group.waiting.push(then);
      } else {
        group.waiting = [then];
        lookup(group, index, request, 0);
      }
    },
  };
}
