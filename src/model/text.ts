/**
 * Lower-case a name for use mid-sentence ("Add load balancer"), leaving
 * acronyms alone ("Add API gateway", "Add CDN").
 */
export function midSentence(name: string): string {
  const [first = "", second = ""] = name;
  return second && second === second.toUpperCase() && /[a-z]/i.test(second)
    ? name
    : first.toLowerCase() + name.slice(1);
}
