import { describe, expect, it } from "vitest";
import { canConnect, defaultParams, paramsSchema } from "./component.ts";
import { testClient, testDatabase, testService } from "./fixtures.ts";

describe("defaultParams", () => {
  it("collects every parameter's default", () => {
    expect(defaultParams(testService)).toEqual({
      workers: 8,
      balancing: "round-robin",
      retries: false,
    });
    expect(defaultParams(testDatabase)).toEqual({});
  });
});

describe("paramsSchema", () => {
  const schema = paramsSchema(testService);

  it("fills in missing values with defaults", () => {
    expect(schema.parse({ workers: 2 })).toEqual({
      workers: 2,
      balancing: "round-robin",
      retries: false,
    });
  });

  it("rejects values outside the range or not in the options", () => {
    expect(schema.safeParse({ workers: 0 }).success).toBe(false);
    expect(schema.safeParse({ workers: 2000 }).success).toBe(false);
    expect(schema.safeParse({ balancing: "random" }).success).toBe(false);
    expect(schema.safeParse({ retries: "yes" }).success).toBe(false);
  });
});

describe("canConnect", () => {
  it("allows listed targets", () => {
    expect(canConnect(testClient, testService)).toEqual({ ok: true });
    expect(canConnect(testService, testDatabase)).toEqual({ ok: true });
  });

  it("explains why a connection isn't allowed", () => {
    expect(canConnect(testDatabase, testService)).toEqual({
      ok: false,
      reason: "Database doesn't send requests to other components.",
    });
    expect(canConnect(testService, testClient)).toEqual({
      ok: false,
      reason: "Client doesn't take requests.",
    });
    expect(canConnect(testService, testService)).toEqual({
      ok: false,
      reason: "Service can't send requests to a service.",
    });
  });
});
