import { describe, expect, it } from "vitest";
import { createSystemDocument, type SystemDocument } from "../model/document.ts";
import {
  BackupError,
  backupFileName,
  buildBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
} from "./backup.ts";

const system = (id: string, name: string): SystemDocument => ({
  ...createSystemDocument({ id, name, now: 1000 }),
  nodes: [
    { id: "n", type: "cache", name: "Cache", position: { x: 8, y: 16 }, params: { size: 500 } },
  ],
});

describe("backup files", () => {
  it("round-trips systems exactly", () => {
    const systems = [system("a", "Checkout"), system("b", "Payments")];
    const text = serializeBackup(buildBackup(systems, new Date("2026-10-17T10:00:00Z")));
    expect(JSON.parse(text)).toMatchObject({
      format: "0n1-backup",
      version: 1,
      exportedAt: "2026-10-17T10:00:00.000Z",
    });
    expect(parseBackup(text)).toEqual({ systems, skipped: [] });
  });

  it("accepts a bare system document", () => {
    const doc = system("a", "Solo");
    expect(parseBackup(JSON.stringify(doc)).systems).toEqual([doc]);
  });

  it("skips unreadable systems and reports them", () => {
    const text = JSON.stringify({
      format: "0n1-backup",
      version: 1,
      systems: [system("a", "Fine"), { name: "Broken", schemaVersion: 1 }, 42],
    });
    const parsed = parseBackup(text);
    expect(parsed.systems.map((s) => s.name)).toEqual(["Fine"]);
    expect(parsed.skipped.map((s) => s.name)).toEqual(["Broken", "System 3"]);
    expect(parsed.skipped[0]?.reason).toMatch(/Invalid system/);
  });

  it.each([
    ["not JSON", "{ nope", /isn't valid JSON/],
    ["some other JSON", JSON.stringify({ hello: "world" }), /isn't a 0n1 backup/],
    [
      "a newer backup",
      JSON.stringify({ format: "0n1-backup", version: 99, systems: [] }),
      /newer version/,
    ],
    [
      "an empty backup",
      JSON.stringify({ format: "0n1-backup", version: 1, systems: [] }),
      /doesn't contain any systems/,
    ],
    [
      "only broken systems",
      JSON.stringify({ format: "0n1-backup", version: 1, systems: [{}] }),
      /None of the systems/,
    ],
  ])("explains why %s can't be restored", (_, text, message) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
    expect(() => parseBackup(text)).toThrow(message);
  });

  it("refuses huge files", () => {
    expect(() => parseBackup(" ".repeat(MAX_BACKUP_BYTES + 1))).toThrow(/too large/);
  });

  it("names files by date, and by system when backing up one", () => {
    const now = new Date("2026-10-17T23:00:00Z");
    expect(backupFileName(null, now)).toBe("0n1-backup-2026-10-17.json");
    expect(backupFileName("URL shortener · v2!", now)).toBe("0n1-url-shortener-v2-2026-10-17.json");
    expect(backupFileName("···", now)).toBe("0n1-system-2026-10-17.json");
  });
});
