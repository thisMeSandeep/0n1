import { describe, expect, it } from "vitest";
import { createSystemDocument } from "./document.ts";
import { type Migration, MigrationError, migrate, runMigrations } from "./migrate.ts";

describe("runMigrations", () => {
  const migrations: Record<number, Migration> = {
    1: (doc) => ({ ...doc, renamed: doc.old, old: undefined }),
    2: (doc) => ({ ...doc, added: true }),
  };

  it("applies each step in order and stamps the new version", () => {
    expect(runMigrations({ schemaVersion: 1, old: "x" }, migrations, 3)).toEqual({
      schemaVersion: 3,
      renamed: "x",
      old: undefined,
      added: true,
    });
  });

  it("starts from the document's own version", () => {
    expect(runMigrations({ schemaVersion: 2 }, migrations, 3)).toEqual({
      schemaVersion: 3,
      added: true,
    });
  });

  it("refuses documents from a newer version of 0n1", () => {
    expect(() => runMigrations({ schemaVersion: 4 }, migrations, 3)).toThrow(
      /newer version of 0n1/,
    );
  });

  it("fails clearly when a step is missing", () => {
    expect(() => runMigrations({ schemaVersion: 1 }, { 1: migrations[1]! }, 3)).toThrow(
      "No migration from schema 2 to 3",
    );
  });

  it("rejects things that aren't documents", () => {
    for (const raw of [null, 42, "doc", [], {}, { schemaVersion: "1" }, { schemaVersion: 0 }]) {
      expect(() => runMigrations(raw, migrations, 3)).toThrow(MigrationError);
    }
  });
});

describe("migrate", () => {
  it("returns a current, valid document unchanged", () => {
    const doc = createSystemDocument({ id: "s", now: 1 });
    expect(migrate(structuredClone(doc))).toEqual(doc);
  });

  it("reports where an invalid document is wrong", () => {
    const doc = { ...createSystemDocument({ id: "s", now: 1 }), name: "" };
    expect(() => migrate(doc)).toThrow(/Invalid system at name/);
  });
});
