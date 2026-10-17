import { describe, expect, it } from "vitest";
import { formatClock, formatSpeed, formatTraffic } from "./format.ts";

describe("formatting", () => {
  it("shows simulated time as a clock", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(46_900)).toBe("00:46");
    expect(formatClock(725_000)).toBe("12:05");
    expect(formatClock(3_723_000)).toBe("1:02:03");
    expect(formatClock(-5)).toBe("00:00");
  });

  it("shows speed and traffic", () => {
    expect(formatSpeed(0.5)).toBe("0.5×");
    expect(formatTraffic(1)).toBe("100%");
    expect(formatTraffic(2.5)).toBe("250%");
  });
});
