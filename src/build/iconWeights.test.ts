import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHT, iconWeightsIn, keepWeights } from "./iconWeights.ts";

// Node's fs, typed by hand: the app's tsconfig leaves out Node's types on purpose.
const fs: {
  readdirSync(path: URL, options: { recursive: true; encoding: "utf8" }): string[];
  readFileSync(path: URL, encoding: "utf8"): string;
} = await import(/* @vite-ignore */ "node:fs" as string);

const SRC = new URL("../", import.meta.url);
const DEFS = new URL("../../node_modules/@phosphor-icons/react/dist/defs/", import.meta.url);

/** Our source, as the build plugin reads it. */
function sources(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const file of fs.readdirSync(SRC, { recursive: true, encoding: "utf8" })) {
    if (/\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)) {
      files[file] = fs.readFileSync(new URL(file, SRC), "utf8");
    }
  }
  return files;
}

/** The weights a definition module draws. */
const weightsOf = (code: string) => [...code.matchAll(/\n\s*\[\s*"(\w+)"/g)].map((m) => m[1]);

describe("icon weights", () => {
  it("finds the weights each icon is drawn in, and gives component icons duotone", () => {
    const weights = iconWeightsIn({
      "app/Run.tsx": `<PlayIcon weight="fill" />\n<PauseIcon\n  className="x"\n  onClick={() => go()}\n  weight="fill"\n/>\n<GearIcon />`,
      "ui/componentIcons.tsx": "import { CubeIcon, DatabaseIcon } from 'x';",
    });
    expect(Object.fromEntries([...weights].map(([k, v]) => [k, [...v]]))).toEqual({
      Play: ["fill"],
      Pause: ["fill"],
      Cube: ["duotone"],
      Database: ["duotone"],
    });
  });

  it("keeps only the weights asked for, and leaves the module working", () => {
    const code = fs.readFileSync(new URL("Cube.es.js", DEFS), "utf8");
    expect(weightsOf(code).sort()).toEqual(["bold", "duotone", "fill", "light", "regular", "thin"]);
    const kept = keepWeights(code, new Set(["regular", "duotone"]));
    expect(weightsOf(kept).sort()).toEqual(["duotone", "regular"]);
    expect(kept.length).toBeLessThan(code.length / 2);
    // Still a module that builds the same Map, minus the rest.
    expect(kept).toContain("new Map([");
    expect(kept).toMatch(/\]\);\s*export/);
    expect(kept).toContain("opacity"); // duotone's light layer is intact
  });

  it("leaves anything it doesn't recognise alone", () => {
    expect(keepWeights("export default 1;", new Set(["regular"]))).toBe("export default 1;");
  });

  it("keeps every weight our source draws an icon in", () => {
    const files = sources();
    const weights = iconWeightsIn(files);
    for (const [path, text] of Object.entries(files)) {
      for (const use of text.matchAll(/\bweight="(\w+)"/g)) {
        // The tag this weight belongs to.
        const tag = /<([A-Za-z0-9.]+)[^<]*$/.exec(text.slice(0, use.index))?.[1] ?? "";
        const weight = use[1] as string;
        const where = `${path}: <${tag} weight="${weight}">`;
        if (tag === "Icon") {
          // A component icon, through a variable: they keep duotone (componentIcons.tsx).
          expect(weight, where).toBe("duotone");
          continue;
        }
        expect(tag.endsWith("Icon"), where).toBe(true);
        const name = tag.slice(0, -"Icon".length);
        expect(fs.readFileSync(new URL(`${name}.es.js`, DEFS), "utf8"), where).toContain(
          `"${weight}"`,
        );
        expect(weight === DEFAULT_WEIGHT || weights.get(name)?.has(weight), where).toBe(true);
      }
    }
  });
});
