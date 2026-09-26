import { describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { CUSTOM_CATEGORY, persistCustomRelationTypes } from "./persistCustomType";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";

interface VaultFile {
  path: string;
  content: string;
}

class FakeTFile {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
}

const { MockTFile } = vi.hoisted(() => {
  class MockTFile {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
  }
  return { MockTFile };
});

vi.mock("obsidian", () => ({
  TFile: MockTFile,
  TFolder: MockTFile,
}));

function fakeApp(files: Map<string, string>): App {
  const vault = {
    files,
    getAbstractFileByPath: (path: string) => (files.has(path) ? new MockTFile(path) : null),
    cachedRead: async (file: TFile) => {
      const content = files.get(file.path);
      if (content === undefined) throw new Error(`no file ${file.path}`);
      return content;
    },
    modify: async (file: TFile, content: string) => {
      files.set(file.path, content);
    },
    create: async (path: string, content: string) => {
      files.set(path, content);
    },
    createFolder: async () => undefined,
  };
  return { vault } as unknown as App;
}

describe("persistCustomRelationTypes (Issue #119)", () => {
  it("seeds the default STEM vocabulary plus the custom type when no vocabulary file exists yet", async () => {
    const files = new Map<string, string>();
    await persistCustomRelationTypes(fakeApp(files), {}, [{ label: "IS_HOMOMORPHIC_TO", term: "is homomorphic to", bidirectional: false }]);

    const raw = files.get("wiki/relation-types.json");
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!) as { terms: { label: string; category: string; term: string; key: string }[] };
    expect(parsed.terms.length).toBe(DEFAULT_RELATION_VOCABULARY.length + 1);
    const custom = parsed.terms.find((t) => t.label === "IS_HOMOMORPHIC_TO");
    expect(custom).toBeDefined();
    expect(custom!.category).toBe(CUSTOM_CATEGORY);
    expect(custom!.term).toBe("is homomorphic to");
    expect(custom!.key).toMatch(/^custom/);
  });

  it("appends to an existing vocabulary file without touching existing terms", async () => {
    const existing = { terms: [{ key: "k1", label: "IMPLIES", term: "implies", category: "Logic", bidirectional: false, reversed: false }] };
    const files = new Map<string, string>([["wiki/relation-types.json", JSON.stringify(existing)]]);

    await persistCustomRelationTypes(fakeApp(files), {}, [{ label: "TEACHES", term: "teaches", bidirectional: false }]);

    const parsed = JSON.parse(files.get("wiki/relation-types.json")!) as { terms: { label: string }[] };
    expect(parsed.terms.map((t) => t.label)).toEqual(["IMPLIES", "TEACHES"]);
  });

  it("does not duplicate a label that already exists (case-insensitive)", async () => {
    const existing = { terms: [{ key: "k1", label: "IMPLIES", term: "implies", category: "Logic", bidirectional: false, reversed: false }] };
    const files = new Map<string, string>([["wiki/relation-types.json", JSON.stringify(existing)]]);

    await persistCustomRelationTypes(fakeApp(files), {}, [{ label: "implies", term: "implies", bidirectional: false }]);

    const parsed = JSON.parse(files.get("wiki/relation-types.json")!) as { terms: { label: string }[] };
    expect(parsed.terms.length).toBe(1);
  });

  it("persists multiple custom types in one call, each with a unique key", async () => {
    const files = new Map<string, string>();
    await persistCustomRelationTypes(fakeApp(files), {}, [
      { label: "MOTIVATES", term: "motivates", bidirectional: false },
      { label: "IS_DUAL_TO", term: "is dual to", bidirectional: true },
    ]);

    const parsed = JSON.parse(files.get("wiki/relation-types.json")!) as { terms: { key: string; label: string; bidirectional: boolean }[] };
    const motivates = parsed.terms.find((t) => t.label === "MOTIVATES");
    const dual = parsed.terms.find((t) => t.label === "IS_DUAL_TO");
    expect(motivates).toBeDefined();
    expect(dual).toBeDefined();
    expect(dual!.bidirectional).toBe(true);
    expect(new Set(parsed.terms.map((t) => t.key)).size).toBe(parsed.terms.length);
  });

  it("keeps bundled default entries intact when the active vocabulary path differs from the default", async () => {
    const files = new Map<string, string>();
    await persistCustomRelationTypes(fakeApp(files), { relationVocabularyPath: "wiki/presets/law.json" }, [
      { label: "AMENDS", term: "amends", bidirectional: false },
    ]);

    const parsed = JSON.parse(files.get("wiki/presets/law.json")!) as { terms: { label: string }[] };
    expect(parsed.terms.some((t) => t.label === "AMENDS")).toBe(true);
    expect(parsed.terms.some((t) => t.label === "IMPLIES")).toBe(true);
  });

  it("returns true without writing when the custom type list is empty", async () => {
    const files = new Map<string, string>();
    const ok = await persistCustomRelationTypes(fakeApp(files), {}, []);
    expect(ok).toBe(true);
    expect(files.size).toBe(0);
  });

  it("resolves key collisions by suffixing instead of overwriting", async () => {
    const existing = { terms: [{ key: "customMOTIVATES", label: "MOTIVATES", term: "motivates", category: "Logic", bidirectional: false, reversed: false }] };
    const files = new Map<string, string>([["wiki/relation-types.json", JSON.stringify(existing)]]);

    // MOTIVATES already known by label -> skipped; IS_DUAL_TO gets key customIS_DUAL_TO (no collision).
    await persistCustomRelationTypes(fakeApp(files), {}, [{ label: "IS_DUAL_TO", term: "is dual to", bidirectional: false }]);
    const parsed = JSON.parse(files.get("wiki/relation-types.json")!) as { terms: { key: string }[] };
    expect(new Set(parsed.terms.map((t) => t.key)).size).toBe(2);
  });
});
