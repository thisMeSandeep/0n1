import type { NumberParam } from "../model/component.ts";

/*
 * Parameters several components share, so their wording, units and ranges
 * stay consistent across the inspector.
 */

export function concurrencyParam(label: string, defaultValue: number): NumberParam {
  return {
    kind: "number",
    label,
    section: "capacity",
    help: "How many it can work on at the same time. The rest wait in line.",
    default: defaultValue,
    min: 1,
    max: 1024,
    step: 1,
    scale: "log",
  };
}

export function workTimeParam(label: string, defaultMs: number, maxMs = 10_000): NumberParam {
  return {
    kind: "number",
    label,
    section: "capacity",
    help: "Average time to handle one. Real times vary around this.",
    default: defaultMs,
    min: 0.1,
    max: maxMs,
    scale: "log",
    unit: "ms",
  };
}

export function maxWaitingParam(defaultValue: number): NumberParam {
  return {
    kind: "number",
    label: "Max waiting in line",
    section: "failure",
    help: "When the line is this long, new requests are turned away.",
    default: defaultValue,
    min: 1,
    max: 100_000,
    step: 1,
    scale: "log",
  };
}

export const errorRateParam: NumberParam = {
  kind: "number",
  label: "Error rate",
  section: "failure",
  help: "Share of requests that fail for reasons of their own, like bugs.",
  default: 0,
  min: 0,
  max: 100,
  step: 0.1,
  unit: "%",
};

export function addedDelayParam(defaultMs: number): NumberParam {
  return {
    kind: "number",
    label: "Added delay",
    section: "behaviour",
    help: "Time it adds to every request passing through.",
    default: defaultMs,
    min: 0.1,
    max: 100,
    scale: "log",
    unit: "ms",
  };
}

export function throughputLimitParam(defaultPerSecond: number): NumberParam {
  return {
    kind: "number",
    label: "Throughput limit",
    section: "capacity",
    help: "The most requests per second it can pass on.",
    default: defaultPerSecond,
    min: 100,
    max: 1_000_000,
    step: 1,
    scale: "log",
    unit: "/s",
  };
}
