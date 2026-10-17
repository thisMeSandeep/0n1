import { registry } from "../components/index.ts";
import jobPipeline from "./catalog/job-pipeline.json";
import urlShortener from "./catalog/url-shortener.json";
import writeHeavy from "./catalog/write-heavy.json";
import { type Blueprint, compareBlueprints, parseBlueprint } from "./format.ts";

/*
 * The blueprints shipped with 0n1: the JSON files in ./catalog. Adding a
 * blueprint means adding its file and one line here; CI checks that every
 * file is listed, valid, compiles, and tells its story (catalog.test.ts,
 * stories.test.ts).
 *
 * An explicit list rather than a glob: it works outside Vite too, and test
 * caches can't miss a new file.
 */
const files: Readonly<Record<string, unknown>> = {
  "url-shortener.json": urlShortener,
  "write-heavy.json": writeHeavy,
  "job-pipeline.json": jobPipeline,
};

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

/** For the catalog test: every listed file, by file name, as shipped. */
export const BLUEPRINT_FILES: Readonly<Record<string, unknown>> = files;
