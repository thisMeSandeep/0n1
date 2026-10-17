import { describe, expect, it } from "vitest";
import { midSentence } from "../model/text.ts";
import { scoreCommand } from "./text.ts";

describe("midSentence", () => {
  it("lower-cases ordinary names but not acronyms", () => {
    expect(midSentence("Load balancer")).toBe("load balancer");
    expect(midSentence("Cache")).toBe("cache");
    expect(midSentence("API gateway")).toBe("API gateway");
    expect(midSentence("CDN")).toBe("CDN");
  });
});

describe("scoreCommand", () => {
  it("matches every word as a substring, never fuzzily", () => {
    expect(scoreCommand("Switch to dark theme", "dark")).toBe(1);
    expect(scoreCommand("Add worker", "dark", ["job", "background"])).toBe(0);
  });

  it("ranks word-start name matches above mid-word and keyword matches", () => {
    const wordStart = scoreCommand("Add database", "data");
    const midWord = scoreCommand("Add database", "base");
    const keyword = scoreCommand("Add database", "sql", ["db", "sql"]);
    expect(wordStart).toBeGreaterThan(midWord);
    expect(midWord).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(0);
  });

  it("requires all words and handles an empty search", () => {
    expect(scoreCommand("Add read replica", "add replica")).toBe(1);
    expect(scoreCommand("Add read replica", "add teleporter")).toBe(0);
    expect(scoreCommand("anything", "  ")).toBe(1);
    expect(scoreCommand("Zoom to 100%", "100%")).toBe(1);
  });
});
