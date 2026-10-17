import { describe, expect, it } from "vitest";
import { fromPosition, parseNumber, roundValue, stepValue, toPosition } from "./scale.ts";

describe("linear mapping", () => {
  const range = { min: 0, max: 200 };

  it("maps value to position and back", () => {
    expect(toPosition(50, range)).toBe(0.25);
    expect(fromPosition(0.25, range)).toBe(50);
  });

  it("clamps out-of-range input", () => {
    expect(toPosition(-10, range)).toBe(0);
    expect(toPosition(999, range)).toBe(1);
    expect(fromPosition(1.5, range)).toBe(200);
  });
});

describe("log mapping", () => {
  const range = { min: 1, max: 10_000, scale: "log" as const };

  it("puts each decade at an equal distance", () => {
    expect(toPosition(1, range)).toBe(0);
    expect(toPosition(10, range)).toBeCloseTo(0.25);
    expect(toPosition(100, range)).toBeCloseTo(0.5);
    expect(toPosition(10_000, range)).toBe(1);
  });

  it("round-trips through position with 3 significant figures", () => {
    for (const value of [1, 2.5, 12, 840, 1230, 9990]) {
      expect(fromPosition(toPosition(value, range), range)).toBe(value);
    }
  });

  it("rejects a log range that includes zero", () => {
    expect(() => toPosition(1, { min: 0, max: 10, scale: "log" })).toThrow(RangeError);
  });
});

describe("roundValue", () => {
  it("snaps to step without floating point noise", () => {
    expect(roundValue(0.30000000000000004, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
    expect(roundValue(12.6, { min: 0, max: 100, step: 1 })).toBe(13);
    expect(roundValue(0.0123, { min: 0, max: 1, step: 0.005 })).toBe(0.01);
  });
});

describe("stepValue", () => {
  it("moves linear values by step, or 10× with large", () => {
    const range = { min: 0, max: 100, step: 1 };
    expect(stepValue(50, 1, range)).toBe(51);
    expect(stepValue(50, -1, range, true)).toBe(40);
  });

  it("moves log values by a constant factor", () => {
    const range = { min: 1, max: 10_000, scale: "log" as const };
    expect(stepValue(100, 1, range)).toBe(110);
    expect(stepValue(100, -1, range, true)).toBe(50);
  });

  it("always changes the value when a step would round to the same number", () => {
    const range = { min: 1, max: 1000, scale: "log" as const, step: 1 };
    expect(stepValue(1, 1, range)).toBe(2);
    expect(stepValue(2, -1, range)).toBe(1);
  });

  it("stops at the limits", () => {
    const range = { min: 1, max: 100, step: 1 };
    expect(stepValue(100, 1, range)).toBe(100);
    expect(stepValue(1, -1, range)).toBe(1);
  });
});

describe("parseNumber", () => {
  it("parses plain and grouped numbers", () => {
    expect(parseNumber(" 42 ")).toBe(42);
    expect(parseNumber("1,500")).toBe(1500);
    expect(parseNumber("0.5")).toBe(0.5);
  });

  it("returns null for anything else", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("Infinity")).toBeNull();
  });
});
