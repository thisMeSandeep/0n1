import { describe, expect, it } from "vitest";
import { formatEdited } from "./time.ts";

const now = new Date("2026-10-17T12:00:00Z").getTime();
const ago = (ms: number) => formatEdited(now - ms, now);

describe("formatEdited", () => {
  it("reads naturally for recent edits", () => {
    expect(ago(5_000)).toBe("just now");
    expect(ago(60_000)).toBe("1 minute ago");
    expect(ago(25 * 60_000)).toBe("25 minutes ago");
    expect(ago(2 * 3_600_000)).toBe("2 hours ago");
    expect(ago(30 * 3_600_000)).toBe("yesterday");
    expect(ago(4 * 86_400_000)).toBe("4 days ago");
  });

  it("uses a date for older edits, with the year only when it differs", () => {
    expect(ago(30 * 86_400_000)).toBe("Sep 17");
    expect(formatEdited(new Date("2025-03-03T12:00:00Z").getTime(), now)).toBe("Mar 3, 2025");
  });

  it("treats clock skew as just now", () => {
    expect(formatEdited(now + 10_000, now)).toBe("just now");
  });
});
