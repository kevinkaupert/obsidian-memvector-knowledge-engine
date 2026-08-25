import { describe, expect, it } from "vitest";
import { buildGraphStatements, sanitizeRelType, toCypherText } from "./cypherBuilder";

describe("sanitizeRelType", () => {
  it("uppercases and replaces invalid characters with underscores", () => {
    expect(sanitizeRelType("is homomorphic to")).toBe("IS_HOMOMORPHIC_TO");
  });

  it("trims leading/trailing underscores", () => {
    expect(sanitizeRelType("__requires__")).toBe("REQUIRES");
  });

  it("falls back to RELATED_TO for empty input", () => {
    expect(sanitizeRelType("")).toBe("RELATED_TO");
    expect(sanitizeRelType("???")).toBe("RELATED_TO");
  });
});

describe("buildGraphStatements", () => {
  it("produces one parameterized MERGE per node and one per edge", () => {
    const nodes = [
      { id: "a", title: "A", path: "a.md" },
      { id: "b", title: "B", path: "b.md" },
    ];
    const edges = [{ src: "a", tgt: "b", type: "LINKS_TO" }];

    const statements = buildGraphStatements(nodes, edges);
    expect(statements).toHaveLength(3);
    expect(statements[0].query).toContain("$id");
    expect(statements[0].params).toEqual({ id: "a", title: "A", path: "a.md" });
    expect(statements[2].query).toContain("LINKS_TO");
    expect(statements[2].params).toEqual({ src: "a", tgt: "b" });
  });

  it("never interpolates node data directly into the query string (parameterized, injection-safe)", () => {
    const nodes = [{ id: "a", title: 'Robert"); DROP GRAPH; --', path: "a.md" }];
    const statements = buildGraphStatements(nodes, []);
    expect(statements[0].query).not.toContain("DROP GRAPH");
    expect(statements[0].params.title).toContain("DROP GRAPH");
  });
});

describe("toCypherText", () => {
  it("escapes quotes and backslashes in the literal preview text", () => {
    const nodes = [{ id: "a", title: 'Quote " Mark', path: "a.md" }];
    const text = toCypherText(nodes, []);
    expect(text).toContain('Quote \\" Mark');
  });
});
