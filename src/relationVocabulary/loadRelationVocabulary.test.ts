import { describe, expect, it, vi, beforeEach } from "vitest";
import type { App, TFile } from "obsidian";
import { loadRelationVocabulary, DEFAULT_RELATION_VOCABULARY_PATH } from "./loadRelationVocabulary";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import { createVocabularyMutator } from "./vocabularyMutations";
import type { RelationTermDef, RelationVocabularyFile } from "./types";

const notices: string[] = [];

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
  Notice: class {
    constructor(public message: string) {
      notices.push(message);
    }
  },
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
    process: async (file: TFile, fn: (data: string) => string) => {
      const content = files.get(file.path);
      if (content === undefined) throw new Error(`no file ${file.path}`);
      const updated = fn(content);
      files.set(file.path, updated);
      return updated;
    },
    create: async (path: string, content: string) => {
      files.set(path, content);
    },
    createFolder: async () => undefined,
  };
  return { vault } as unknown as App;
}

describe("loadRelationVocabulary (Issues #139, #149)", () => {
  beforeEach(() => {
    notices.length = 0;
  });

  it("seeds the default STEM vocabulary when no vocabulary file exists yet", async () => {
    const files = new Map<string, string>();
    const app = fakeApp(files);
    const vocab = await loadRelationVocabulary(app, {});

    expect(vocab).toEqual(DEFAULT_RELATION_VOCABULARY);
    expect(files.has(DEFAULT_RELATION_VOCABULARY_PATH)).toBe(true);
    expect(notices.length).toBe(0);
  });

  it("loads a valid custom vocabulary and applies bundled layout defaults", async () => {
    const customTerm: RelationTermDef = {
      key: "customParentOf",
      label: "PARENT_OF",
      term: "parent of",
      category: "Kinship",
      bidirectional: false,
      reversed: false,
    };
    const files = new Map<string, string>([
      [DEFAULT_RELATION_VOCABULARY_PATH, JSON.stringify({ terms: [customTerm] })],
    ]);
    const app = fakeApp(files);
    const vocab = await loadRelationVocabulary(app, {});

    expect(vocab.length).toBe(1);
    expect(vocab[0].label).toBe("PARENT_OF");
    expect(notices.length).toBe(0);
  });

  it("returns an empty array when vocabulary file contains { terms: [] } without falling back to STEM (Issue #139)", async () => {
    const files = new Map<string, string>([
      [DEFAULT_RELATION_VOCABULARY_PATH, JSON.stringify({ terms: [] })],
    ]);
    const app = fakeApp(files);
    const vocab = await loadRelationVocabulary(app, {});

    expect(vocab).toEqual([]);
    expect(notices.length).toBe(0);
  });

  it("end-to-end: mutating to empty array via createVocabularyMutator reloads as empty preset without falling back to STEM (Issue #139)", async () => {
    const singleTerm: RelationTermDef = {
      key: "customTest",
      label: "TEST",
      term: "test",
      category: "Test",
      bidirectional: false,
      reversed: false,
    };
    const files = new Map<string, string>([
      [DEFAULT_RELATION_VOCABULARY_PATH, JSON.stringify({ terms: [singleTerm] })],
    ]);
    const app = fakeApp(files);

    // Initial load returns the single term
    const initial = await loadRelationVocabulary(app, {});
    expect(initial.length).toBe(1);
    expect(initial[0].label).toBe("TEST");

    // Mutator deletes the last type, leaving { terms: [] }
    const mutator = createVocabularyMutator(app, () => DEFAULT_RELATION_VOCABULARY_PATH);
    const mutation = await mutator.mutate((current) => current.filter((t) => t.label !== "TEST"));
    expect(mutation.result).toBe("written");

    // Next load reloads the empty preset without resurrecting the 13 STEM types
    const afterDelete = await loadRelationVocabulary(app, {});
    expect(afterDelete).toEqual([]);
    expect(notices.length).toBe(0);
  });

  it("falls back to default STEM vocabulary with a Notice when JSON is unparseable", async () => {
    const files = new Map<string, string>([
      [DEFAULT_RELATION_VOCABULARY_PATH, "INVALID_JSON{}"],
    ]);
    const app = fakeApp(files);
    const vocab = await loadRelationVocabulary(app, {});

    expect(vocab).toEqual(DEFAULT_RELATION_VOCABULARY);
    expect(notices.length).toBe(1);
    expect(notices[0]).toContain("[WARN]");
  });

  it("falls back to default STEM vocabulary with a Notice when terms property is missing or not an array", async () => {
    const files = new Map<string, string>([
      [DEFAULT_RELATION_VOCABULARY_PATH, JSON.stringify({ invalid: true })],
    ]);
    const app = fakeApp(files);
    const vocab = await loadRelationVocabulary(app, {});

    expect(vocab).toEqual(DEFAULT_RELATION_VOCABULARY);
    expect(notices.length).toBe(1);
    expect(notices[0]).toContain("[WARN]");
    expect(notices[0]).toContain("missing terms array");
  });

  it("falls back to default STEM vocabulary with a Notice when terms array has only invalid entries", async () => {
    const files = new Map<string, string>([
      [DEFAULT_RELATION_VOCABULARY_PATH, JSON.stringify({ terms: ["bad_entry", { missing_fields: 123 }] })],
    ]);
    const app = fakeApp(files);
    const vocab = await loadRelationVocabulary(app, {});

    expect(vocab).toEqual(DEFAULT_RELATION_VOCABULARY);
    expect(notices.length).toBe(1);
    expect(notices[0]).toContain("[WARN]");
    expect(notices[0]).toContain("no valid terms");
  });

  it("preserves valid terms when terms array contains a mixture of valid and invalid entries", async () => {
    const validTerm: RelationTermDef = {
      key: "customA",
      label: "TYPE_A",
      term: "type a",
      category: "Test",
      bidirectional: false,
      reversed: false,
    };
    const files = new Map<string, string>([
      [DEFAULT_RELATION_VOCABULARY_PATH, JSON.stringify({ terms: [validTerm, { invalid: true }] })],
    ]);
    const app = fakeApp(files);
    const vocab = await loadRelationVocabulary(app, {});

    expect(vocab.length).toBe(1);
    expect(vocab[0].label).toBe("TYPE_A");
    expect(notices.length).toBe(0);
  });
});
