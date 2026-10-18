import { describe, expect, it } from "vitest";
import type { Span, TraceRecord } from "../engine/runtime/trace.ts";
import { tracedLinks, traceEnd, waterfall, whereTimeWent } from "./waterfall.ts";

const span = (patch: Partial<Span> & Pick<Span, "id" | "node">): Span => ({
  parent: null,
  sentAt: 0,
  arrivedAt: null,
  startedAt: null,
  repliedAt: null,
  receivedAt: null,
  outcome: null,
  attempt: 1,
  op: "read",
  ...patch,
});

// users → api (waits 10 ms, works 20) → db (works 50, answering after the client gave up)
const trace: TraceRecord = {
  id: "t",
  reason: "asked",
  client: "users",
  kind: "read",
  startedAt: 0,
  finishedAt: 60,
  outcome: "timeout",
  spans: [
    span({
      id: 0,
      node: "users",
      arrivedAt: 0,
      startedAt: 0,
      repliedAt: 60,
      receivedAt: 60,
      outcome: "timeout",
    }),
    span({
      id: 1,
      parent: 0,
      node: "api",
      sentAt: 0,
      arrivedAt: 2,
      startedAt: 12,
      repliedAt: null,
    }),
    span({
      id: 2,
      parent: 1,
      node: "db",
      sentAt: 32,
      arrivedAt: 33,
      startedAt: 33,
      repliedAt: 83,
      receivedAt: 84,
      outcome: "ok",
    }),
  ],
};

describe("the waterfall", () => {
  it("lasts until the last thing recorded, even after the client gave up", () => {
    expect(traceEnd(trace)).toBe(84);
  });

  it("lists hops in call order, indented by depth, with waiting and working times", () => {
    const rows = waterfall(trace);
    expect(rows.map((r) => [r.span.node, r.depth])).toEqual([
      ["users", 0],
      ["api", 1],
      ["db", 2],
    ]);
    const [, api, db] = rows;
    expect(api).toMatchObject({ unfinished: true, waited: 10, worked: null });
    // Its own work stops while its call to the database is out.
    expect(api?.working).toEqual(
      [
        { start: 12 / 84, end: 32 / 84 },
        { start: 1, end: 1 },
      ].slice(0, 1),
    );
    expect(api?.waiting?.start).toBeCloseTo(2 / 84);
    expect(api?.waiting?.end).toBeCloseTo(12 / 84);
    expect(db).toMatchObject({ unfinished: false, waited: 0, worked: 50, total: 52 });
    // The client did nothing itself: it was waiting on the API the whole time.
    expect(rows[0]?.worked).toBeCloseTo(0);
    expect(db?.waiting).toBeNull();
    expect(db?.end).toBeCloseTo(1);
  });

  it("knows which connections the request used", () => {
    expect([...tracedLinks(trace)]).toEqual(["users→api", "api→db"]);
  });
});

describe("where the time went", () => {
  it("adds up each component's waiting and work, until the client had its answer", () => {
    // The client gave up at 60 ms: the database's work after that isn't the request's time.
    const shares = whereTimeWent(trace);
    expect(shares.map((s) => s.node)).toEqual(["api", "db"]);
    expect(shares[0]).toMatchObject({ node: "api", waited: 10, worked: 20 }); // waited 2 → 12, worked 12 → 32
    expect(shares[0]?.share).toBeCloseTo(30 / 60);
    expect(shares[1]).toMatchObject({ node: "db", waited: 0, worked: 27 }); // 33 → 60
  });
});
