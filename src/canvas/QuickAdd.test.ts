import { describe, expect, it } from "vitest";
import { componentDefinitions } from "../components/index.ts";
import { quickAddCandidates } from "./QuickAdd.tsx";

const types = (from: string | null) => quickAddCandidates(from).map((d) => d.type);

describe("quickAddCandidates", () => {
  it("offers every component when not connecting", () => {
    expect(quickAddCandidates(null)).toEqual(componentDefinitions);
  });

  it("offers only what the source may connect to", () => {
    expect(types("client")).toEqual([
      "load-balancer",
      "api-gateway",
      "cdn",
      "rate-limiter",
      "service",
    ]);
    expect(types("queue")).toEqual(["worker"]);
    expect(types("database")).toEqual(["read-replica"]);
  });

  it("offers nothing for components that don't send requests", () => {
    expect(types("cache")).toEqual([]);
  });
});
