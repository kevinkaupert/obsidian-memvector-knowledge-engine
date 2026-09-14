import { describe, expect, it } from "vitest";
import { getTranslation } from "../../i18n";
import type { ResolvedRelationEdge } from "../../relationVocabulary/resolveTerm";
import { buildRelationFileContent, relationFilePath } from "./relationFileTemplate";

function edge(overrides: Partial<ResolvedRelationEdge> = {}): ResolvedRelationEdge {
  return {
    src: { id: "work-overview", title: "Overview", path: "Work/Overview.md", type: "concept" },
    tgt: { id: "home-overview", title: "Overview", path: "Home/Overview.md", type: "concept" },
    label: "REQUIRES",
    bidirectional: false,
    originalTerm: "requires",
    ...overrides,
  };
}

describe("buildRelationFileContent", () => {
  it("writes WikiLink targets as the note's real path, never the canonical (slugged) id", () => {
    const content = buildRelationFileContent(edge(), "", getTranslation("de"));

    expect(content).toContain('source_note: "[[Work/Overview|Overview]]"');
    expect(content).toContain('target_note: "[[Home/Overview|Overview]]"');
    expect(content).not.toContain("work-overview");
    expect(content).not.toContain("home-overview");
  });
});

describe("relationFilePath", () => {
  it("stays distinct for same-basename source/target pairs in different folders", () => {
    const a = relationFilePath(edge());
    const b = relationFilePath(
      edge({
        src: { id: "other-overview", title: "Overview", path: "Other/Overview.md", type: "concept" },
      })
    );
    expect(a).not.toBe(b);
  });
});
