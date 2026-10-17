import { registry } from "../components/index.ts";
import { type Blueprint, compareBlueprints, parseBlueprint } from "./format.ts";

/*
 * The blueprints shipped with 0n1: every JSON file in ./catalog. Adding a
 * blueprint means adding one file; CI checks that each one is valid and
 * compiles (catalog.test.ts).
 */

const files = import.meta.glob<unknown>("./catalog/*.json", { eager: true, import: "default" });

function load(): Blueprint[] {
  const blueprints: Blueprint[] = [];
  for (const [path, raw] of Object.entries(files)) {
    try {
      blueprints.push(parseBlueprint(raw, registry));
    } catch (error) {
      // CI stops this from shipping; if it ever does, leave it out rather than break the lab.
      console.error(`0n1: skipping blueprint ${path}`, error);
    }
  }
  return blueprints.sort(compareBlueprints);
}

export const BLUEPRINTS: readonly Blueprint[] = load();

export function findBlueprint(id: string): Blueprint | undefined {
  return BLUEPRINTS.find((b) => b.id === id);
}

/** For the catalog test: every file, by path, as shipped. */
export const BLUEPRINT_FILES: Readonly<Record<string, unknown>> = files;
