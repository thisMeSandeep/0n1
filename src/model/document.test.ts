import { describe, expect, it } from "vitest";
import { createSystemDocument, type SystemDocument, systemDocumentSchema } from "./document.ts";

function sampleDocument(): SystemDocument {
  return {
    ...createSystemDocument({ name: "URL shortener", id: "sys-1", now: 1_700_000_000_000 }),
    nodes: [
      { id: "a", type: "client", name: "Users", position: { x: 0, y: 0 }, params: {} },
      { id: "b", type: "service", name: "API", position: { x: 240, y: 0 }, params: { workers: 4 } },
    ],
    edges: [{ id: "e1", source: "a", target: "b" }],
  };
}

const messages = (doc: unknown) =>
  systemDocumentSchema.safeParse(doc).error?.issues.map((issue) => issue.message) ?? [];

describe("createSystemDocument", () => {
  it("creates a valid, empty system", () => {
    const doc = createSystemDocument({ id: "x", now: 5 });
    expect(systemDocumentSchema.parse(doc)).toEqual(doc);
    expect(doc).toMatchObject({ name: "Untitled system", nodes: [], edges: [] });
    expect(doc.meta).toEqual({ createdAt: 5, updatedAt: 5 });
  });

  it("generates a unique id by default", () => {
    expect(createSystemDocument().id).not.toBe(createSystemDocument().id);
  });
});

describe("systemDocumentSchema", () => {
  it("accepts a well-formed system", () => {
    expect(systemDocumentSchema.safeParse(sampleDocument()).success).toBe(true);
  });

  it("rejects duplicate node ids", () => {
    const doc = sampleDocument();
    doc.nodes.push({ ...doc.nodes[0]!, position: { x: 1, y: 1 } });
    expect(messages(doc)).toContain('Duplicate node id "a"');
  });

  it("accepts sticky notes, with ids of their own that nothing connects to", () => {
    const doc = sampleDocument();
    doc.notes = [{ id: "n1", text: "Try a cache", position: { x: 0, y: 200 } }];
    expect(systemDocumentSchema.safeParse(doc).success).toBe(true);
    // Systems saved before notes existed have none, and still read.
    expect(systemDocumentSchema.safeParse({ ...doc, notes: undefined }).success).toBe(true);

    doc.notes.push({ id: "a", text: "", position: { x: 0, y: 0 } });
    expect(messages(doc)).toContain('Duplicate id "a"');
    doc.notes.pop();
    doc.edges.push({ id: "e2", source: "a", target: "n1" });
    expect(messages(doc)).toContain('Unknown node "n1"');
    doc.edges.pop();
    doc.notes[0]!.text = "x".repeat(5000);
    expect(systemDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects edges to unknown nodes", () => {
    const doc = sampleDocument();
    doc.edges.push({ id: "e2", source: "b", target: "ghost" });
    expect(messages(doc)).toContain('Unknown node "ghost"');
  });

  it("rejects self-connections and duplicate connections", () => {
    const doc = sampleDocument();
    doc.edges.push({ id: "e2", source: "a", target: "a" }, { id: "e3", source: "a", target: "b" });
    expect(messages(doc)).toEqual(
      expect.arrayContaining(["A component can't connect to itself", "Duplicate connection a→b"]),
    );
  });

  it("rejects other schema versions and malformed fields", () => {
    expect(systemDocumentSchema.safeParse({ ...sampleDocument(), schemaVersion: 2 }).success).toBe(
      false,
    );
    expect(systemDocumentSchema.safeParse({ ...sampleDocument(), name: "" }).success).toBe(false);
  });
});
