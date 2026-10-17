import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatCompact,
  formatDuration,
  formatPercent,
  formatSpeed,
  formatTraffic,
} from "./format.ts";

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

  it("shows live numbers with at most 3 significant figures", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(2)).toBe("2");
    expect(formatCompact(2.049)).toBe("2.05");
    expect(formatCompact(0.52)).toBe("0.52");
    expect(formatCompact(84.34)).toBe("84.3");
    expect(formatCompact(99.96)).toBe("100");
    expect(formatCompact(812.4)).toBe("812");
    expect(formatCompact(999.4)).toBe("999");
    expect(formatCompact(999.6)).toBe("1.00k");
    expect(formatCompact(1500)).toBe("1.50k");
    expect(formatCompact(12_440_000)).toBe("12.4M");
    expect(formatCompact(999_700)).toBe("1.00M");
    expect(formatCompact(Number.NaN)).toBe("—");
  });

  it("shows durations in the unit that reads best", () => {
    expect(formatDuration(0.52)).toEqual({ value: "0.52", unit: "ms" });
    expect(formatDuration(84)).toEqual({ value: "84", unit: "ms" });
    expect(formatDuration(999.7)).toEqual({ value: "1", unit: "s" });
    expect(formatDuration(1380)).toEqual({ value: "1.38", unit: "s" });
    expect(formatDuration(150_000)).toEqual({ value: "2.5", unit: "min" });
  });

  it("shows shares as percentages", () => {
    expect(formatPercent(0)).toEqual({ value: "0", unit: "%" });
    expect(formatPercent(0.00001)).toEqual({ value: "<0.01", unit: "%" });
    expect(formatPercent(0.0012)).toEqual({ value: "0.12", unit: "%" });
    expect(formatPercent(0.034)).toEqual({ value: "3.4", unit: "%" });
    expect(formatPercent(0.04)).toEqual({ value: "4", unit: "%" });
    expect(formatPercent(0.452)).toEqual({ value: "45", unit: "%" });
    expect(formatPercent(1)).toEqual({ value: "100", unit: "%" });
  });
});
