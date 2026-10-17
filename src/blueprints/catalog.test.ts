import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import { compile } from "../engine/compile.ts";
import { BLUEPRINT_FILES, BLUEPRINTS } from "./catalog.ts";
import { blueprintDocument, parseBlueprint } from "./format.ts";

// Node's fs, typed by hand: the app's tsconfig leaves out Node's types on purpose.
const { readdirSync }: { readdirSync(path: URL): string[] } = await import(
  /* @vite-ignore */ "node:fs" as string
);

/** CI's check on shipped blueprints: each must be valid, and must compile into a runnable system. */
describe("the blueprint catalog", () => {
  const files = Object.entries(BLUEPRINT_FILES);

  it("lists every file in catalog/, and skips none as invalid", () => {
    const onDisk = readdirSync(new URL("./catalog", import.meta.url)).filter((f) =>
      f.endsWith(".json"),
    );
    expect(Object.keys(BLUEPRINT_FILES).sort()).toEqual(onDisk.sort());
    expect(BLUEPRINTS).toHaveLength(onDisk.length);
  });

  describe.each(files)("%s", (path, raw) => {
    it("is a valid blueprint, named after its id", () => {
      const blueprint = parseBlueprint(raw, registry);
      expect(path).toBe(`${blueprint.id}.json`);
    });

    it("compiles without errors or warnings", () => {
      const blueprint = parseBlueprint(raw, registry);
      const doc = blueprintDocument(blueprint, registry, { id: "check", name: "Check", now: 0 });
      const { errors, warnings } = compile(doc, registry);
      expect(errors.map((e) => e.message)).toEqual([]);
      expect(warnings.map((w) => w.message)).toEqual([]);
    });
  });

  it("has unique ids", () => {
    const ids = BLUEPRINTS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
