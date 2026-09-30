import { describe, expect, it } from "vitest";
import { normalizeFolder, presetsFolder, relationsFolder, resolveVocabularyPath, synthesisFolder, uniqueNotePath } from "./vaultLayout";

describe("vaultLayout (#173)", () => {
  it("keeps today's wiki/ paths as defaults", () => {
    expect(relationsFolder({})).toBe("wiki/relations");
    expect(synthesisFolder({})).toBe("wiki/synthesis");
    expect(presetsFolder({})).toBe("wiki/presets");
    expect(resolveVocabularyPath({})).toBe("wiki/relation-types.json");
  });

  it("uses configured folders, normalized", () => {
    expect(relationsFolder({ relationsFolder: " /Beziehungen/ " })).toBe("Beziehungen");
    expect(synthesisFolder({ synthesisFolder: "Notizen/Synthesen" })).toBe("Notizen/Synthesen");
    expect(presetsFolder({ presetsFolder: "config/presets//" })).toBe("config/presets");
  });

  it("falls back to the default for empty or slash-only values", () => {
    expect(relationsFolder({ relationsFolder: "" })).toBe("wiki/relations");
    expect(normalizeFolder(" / ", "x")).toBe("x");
  });

  it("finds the first free note path in a folder", () => {
    const taken = new Set(["S/a.md", "S/a-1.md"]);
    expect(uniqueNotePath("S", "a", (p) => taken.has(p))).toBe("S/a-2.md");
    expect(uniqueNotePath("S", "b", (p) => taken.has(p))).toBe("S/b.md");
  });
});
