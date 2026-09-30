import { describe, expect, it } from "vitest";
import { frontmatterTypeOf, isInFolder, isRelationNote } from "./relationNotes";

describe("isRelationNote (#173)", () => {
  it("accepts frontmatter type relation anywhere in the vault", () => {
    expect(isRelationNote("Beziehungen/a.md", "relation")).toBe(true);
    expect(isRelationNote("a.md", " Relation ")).toBe(true);
  });

  it("accepts notes inside the relations folder without a type", () => {
    expect(isRelationNote("wiki/relations/a.md", undefined)).toBe(true);
    expect(isRelationNote("relations/a.md", undefined, "relations")).toBe(true);
  });

  it("rejects unrelated folders that merely contain the word relations", () => {
    expect(isRelationNote("Customers/relations/a.md", "concept")).toBe(false);
    expect(isRelationNote("wiki/relationships/a.md", undefined)).toBe(false);
    expect(isRelationNote("wiki/relation-types.md", undefined)).toBe(false);
  });

  it("ignores non-string frontmatter types", () => {
    expect(isRelationNote("a.md", ["relation"])).toBe(false);
  });
});

describe("isInFolder", () => {
  it("matches by prefix and tolerates slashes around the folder", () => {
    expect(isInFolder("a/b/c.md", "/a/b/")).toBe(true);
    expect(isInFolder("a/bc/d.md", "a/b")).toBe(false);
    expect(isInFolder("a.md", "")).toBe(false);
  });
});

describe("frontmatterTypeOf", () => {
  it("reads the type from leading frontmatter only", () => {
    expect(frontmatterTypeOf('---\ntitle: x\ntype: "relation"\n---\nbody')).toBe("relation");
    expect(frontmatterTypeOf("body\n---\ntype: relation\n---")).toBeUndefined();
  });
});
