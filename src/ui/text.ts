/**
 * Score a command for a search: every word must appear in its name or its
 * keywords. Name matches at a word start rank highest. 0 hides it.
 * Predictable substring matching, not fuzzy: "dark" never matches "background".
 */
export function scoreCommand(value: string, search: string, keywords: readonly string[] = []) {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 1;
  const name = value.toLowerCase();
  const extra = keywords.join(" ").toLowerCase();
  let score = 1;
  for (const term of terms) {
    if (new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(name)) continue;
    if (name.includes(term)) score = Math.min(score, 0.8);
    else if (extra.includes(term)) score = Math.min(score, 0.5);
    else return 0;
  }
  return score;
}
