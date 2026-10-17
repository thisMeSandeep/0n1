import type { ComponentDefinition } from "../model/component.ts";

/**
 * Palette search. Every word must match the name, type, keywords or
 * description; name matches rank first.
 */
export function filterComponents(
  definitions: readonly ComponentDefinition[],
  query: string,
): readonly ComponentDefinition[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return definitions;

  const scored = definitions.flatMap((definition) => {
    const name = definition.displayName.toLowerCase();
    const haystack = [
      name,
      definition.type,
      ...(definition.keywords ?? []),
      definition.description.toLowerCase(),
    ].join(" ");
    if (!terms.every((term) => haystack.includes(term))) return [];
    const first = terms[0] ?? "";
    const score = name.startsWith(first) ? 0 : name.includes(first) ? 1 : 2;
    return [{ definition, score }];
  });

  return scored.sort((a, b) => a.score - b.score).map((s) => s.definition);
}
