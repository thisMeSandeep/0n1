/*
 * Bundle budget (M09): after `bun run build`, measures what the app downloads
 * before it can start (the entry script and every chunk it imports
 * statically), gzipped, and fails if that's over budget. Chunks loaded
 * later (lazy overlays, charts, image export, the simulation worker) are
 * listed but don't count.
 *
 *   bun run build && bun scripts/check-bundle.ts
 *
 * Raise the budget on purpose, in the same change that needs it, and say why.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Gzipped KB the app may download before it starts. 309 KB when set (after
 * M09 trimmed icon weights, moved to zod/mini and made overlays lazy; it
 * was 366 KB), with room for normal growth but not for a heavy dependency.
 */
const BUDGET_KB = 320;

const DIST = join(import.meta.dir, "..", "dist");
const kb = (bytes: number) => bytes / 1024;
const gz = (file: string) => gzipSync(readFileSync(join(DIST, file))).length;

const html = readFileSync(join(DIST, "index.html"), "utf8");
const entries = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(
  (m) => m[1] as string,
);

/** The entry and everything it imports statically (`import … from "./x.js"`), not `import("./x.js")`. */
const startup = new Set<string>();
const visit = (file: string) => {
  if (startup.has(file)) return;
  startup.add(file);
  const code = readFileSync(join(DIST, file), "utf8");
  for (const m of code.matchAll(/(?:\bfrom|\bimport)\s*"\.\/([^"]+\.js)"/g)) {
    visit(`assets/${m[1]}`);
  }
};
for (const file of entries) visit(file);

const chunks = readdirSync(join(DIST, "assets"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => `assets/${f}`);
const later = chunks.filter((f) => !startup.has(f));

const sizes = (files: Iterable<string>) =>
  [...files].map((file) => ({ file, gz: gz(file) })).sort((a, b) => b.gz - a.gz);
const startupSizes = sizes(startup);
const total = startupSizes.reduce((sum, f) => sum + f.gz, 0);
const laterTotal = sizes(later).reduce((sum, f) => sum + f.gz, 0);

console.log(
  `Startup: ${kb(total).toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB), in ${startup.size} files`,
);
for (const f of startupSizes.slice(0, 5))
  console.log(`  ${kb(f.gz).toFixed(1).padStart(6)} KB  ${f.file}`);
console.log(`Loaded later: ${kb(laterTotal).toFixed(1)} KB gzipped, in ${later.length} files`);

if (kb(total) > BUDGET_KB) {
  console.error(
    `\nOver budget by ${(kb(total) - BUDGET_KB).toFixed(1)} KB. Load the new code lazily, ` +
      "or raise BUDGET_KB in scripts/check-bundle.ts, saying why.",
  );
  process.exit(1);
}
