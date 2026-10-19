/*
 * Smaller icons (M09). Each Phosphor icon ships all six of its weights
 * (thin, light, regular, bold, fill, duotone), and 0n1 draws nearly all of
 * them in one. At build time (see vite.config.ts) every icon keeps only the
 * weights our source uses it in, which takes most of the icons' size out of
 * the bundle. Plain functions, so they're tested: src/build/iconWeights.test.ts.
 */

/** Every icon keeps this one: it's what an icon without a `weight` draws. */
export const DEFAULT_WEIGHT = "regular";

/** Component icons (UIUX §5) are drawn duotone wherever they appear, through a variable. */
const COMPONENT_ICONS_FILE = /(^|\/)ui\/componentIcons\.tsx$/;

/**
 * The weights each icon is drawn in besides regular, by icon name ("Cube"
 * for CubeIcon), from source files keyed by path. Icons are always
 * self-closing (`<CubeIcon weight="duotone" />`), so a tag runs to its `/>`.
 */
export function iconWeightsIn(files: Readonly<Record<string, string>>): Map<string, Set<string>> {
  const weights = new Map<string, Set<string>>();
  const add = (name: string, weight: string) => {
    const set = weights.get(name) ?? new Set<string>();
    set.add(weight);
    weights.set(name, set);
  };
  for (const [path, text] of Object.entries(files)) {
    for (const tag of text.matchAll(/<([A-Z][A-Za-z0-9]*)Icon\b/g)) {
      const end = text.indexOf("/>", tag.index);
      const weight = /\bweight="(\w+)"/.exec(text.slice(tag.index, end))?.[1];
      if (weight) add(tag[1] as string, weight);
    }
    if (COMPONENT_ICONS_FILE.test(path)) {
      for (const ref of text.matchAll(/\b([A-Z][A-Za-z0-9]*)Icon\b/g)) {
        add(ref[1] as string, "duotone");
      }
    }
  }
  return weights;
}

/**
 * A Phosphor icon definition module with only some of its weights. It's a
 * `new Map([["bold", …], ["duotone", …], …])`; entries are found by
 * matching brackets, skipping strings. Anything unexpected is left as it is.
 */
export function keepWeights(code: string, keep: ReadonlySet<string>): string {
  const open = code.indexOf("new Map([");
  if (open < 0) return code;
  const start = open + "new Map([".length;
  const entries: { from: number; to: number; weight: string }[] = [];
  let depth = 0;
  let entryStart = -1;
  let end = -1;
  for (let i = start; i < code.length && end < 0; i++) {
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      // Skip the string.
      for (i++; i < code.length && code[i] !== ch; i++) if (code[i] === "\\") i++;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      if (depth === 0 && ch === "[") entryStart = i;
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0)
        end = i; // the Map's array closes
      else if (--depth === 0 && ch === "]" && entryStart >= 0) {
        const weight = /^\[\s*"(\w+)"/.exec(code.slice(entryStart, i))?.[1];
        if (!weight) return code;
        entries.push({ from: entryStart, to: i + 1, weight });
        entryStart = -1;
      }
    }
  }
  if (end < 0 || entries.length === 0) return code;
  const kept = entries.filter((e) => keep.has(e.weight)).map((e) => code.slice(e.from, e.to));
  return `${code.slice(0, start)}\n  ${kept.join(",\n  ")}\n${code.slice(end)}`;
}
