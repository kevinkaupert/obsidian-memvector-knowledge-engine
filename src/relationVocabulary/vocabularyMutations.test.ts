import { describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { createVocabularyMutator } from "./vocabularyMutations";
import { applyLayoutEdit } from "./layoutDefaults";
import type { RelationTermDef } from "./types";

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

const PATH = "wiki/relation-types.json";

function term(label: string, extra: Partial<RelationTermDef> = {}): RelationTermDef {
  return { key: label.toLowerCase(), label, term: label, category: "Custom", bidirectional: false, reversed: false, ...extra };
}

function fakeApp(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  let failRead = false;
  let failWrite = false;
  const vault = {
    getAbstractFileByPath: (path: string) => (files.has(path) ? new MockTFile(path) : null),
    read: async (file: TFile) => {
      if (failRead) throw new Error("read boom");
      const content = files.get(file.path);
      if (content === undefined) throw new Error(`no file ${file.path}`);
      return content;
    },
    cachedRead: async (file: TFile) => files.get(file.path) ?? "",
    modify: async (file: TFile, content: string) => {
      if (failWrite) throw new Error("write boom");
      files.set(file.path, content);
    },
    create: async (path: string, content: string) => files.set(path, content),
    createFolder: async () => undefined,
  };
  return {
    app: { vault } as unknown as App,
    files,
    setFailRead: (v: boolean) => (failRead = v),
    setFailWrite: (v: boolean) => (failWrite = v),
    terms: (): RelationTermDef[] => JSON.parse(files.get(PATH)!).terms,
    weightOf: (label: string): number | undefined => (JSON.parse(files.get(PATH)!).terms as RelationTermDef[]).find((x) => x.label === label)?.weight,
  };
}

function seeded() {
  return fakeApp({ [PATH]: JSON.stringify({ terms: [term("A"), term("B")] }, null, 2) });
}

/** Mirrors what the Settings table does for one row's weight/repels edit. */
const editWeight = (label: string, weight: number) => (current: RelationTermDef[]) =>
  current.map((x) => (x.label.toUpperCase() === label.toUpperCase() ? applyLayoutEdit(x, weight, false) : x));

describe("createVocabularyMutator", () => {
  it("keeps an earlier weight edit when a second row is edited afterwards", async () => {
    const env = seeded();
    const mutator = createVocabularyMutator(env.app, PATH);

    await mutator.mutate(editWeight("A", 2));
    await mutator.mutate(editWeight("B", 3));

    expect(env.weightOf("A")).toBe(2);
    expect(env.weightOf("B")).toBe(3);
  });

  it("keeps a weight edit when another row is deleted afterwards", async () => {
    const env = seeded();
    const mutator = createVocabularyMutator(env.app, PATH);

    await mutator.mutate(editWeight("A", 2));
    await mutator.mutate((current) => current.filter((x) => x.label !== "B"));

    expect(env.weightOf("A")).toBe(2);
    expect(env.terms().map((x) => x.label)).toEqual(["A"]);
  });

  it("keeps a weight edit when a type is added afterwards", async () => {
    const env = seeded();
    const mutator = createVocabularyMutator(env.app, PATH);

    await mutator.mutate(editWeight("A", 2));
    await mutator.mutate((current) => [...current, term("C")]);

    expect(env.weightOf("A")).toBe(2);
    expect(env.terms().map((x) => x.label)).toEqual(["A", "B", "C"]);
  });

  it("does not lose an edit when two mutations are started without awaiting the first", async () => {
    const env = seeded();
    const mutator = createVocabularyMutator(env.app, PATH);

    // Both started before either resolves - the queue has to serialize them.
    const first = mutator.mutate(editWeight("A", 2));
    const second = mutator.mutate(editWeight("B", 3));
    await Promise.all([first, second]);

    expect(env.weightOf("A")).toBe(2);
    expect(env.weightOf("B")).toBe(3);
  });

  it("aborts without writing when the file cannot be read", async () => {
    const env = seeded();
    const mutator = createVocabularyMutator(env.app, PATH);
    const before = env.files.get(PATH);

    env.setFailRead(true);
    const outcome = await mutator.mutate(editWeight("A", 2));

    expect(outcome.result).toBe("read-failed");
    expect(env.files.get(PATH)).toBe(before);
  });

  it("aborts without writing when the file is missing entirely", async () => {
    const env = fakeApp();
    const mutator = createVocabularyMutator(env.app, PATH);

    const outcome = await mutator.mutate(() => [term("A")]);

    expect(outcome.result).toBe("read-failed");
    expect(env.files.has(PATH)).toBe(false);
  });

  it("reports a write failure and leaves the file untouched", async () => {
    const env = seeded();
    const mutator = createVocabularyMutator(env.app, PATH);
    const before = env.files.get(PATH);

    env.setFailWrite(true);
    const outcome = await mutator.mutate(editWeight("A", 2));

    expect(outcome.result).toBe("write-failed");
    expect(env.files.get(PATH)).toBe(before);
  });

  it("keeps serving later mutations after one failed", async () => {
    const env = seeded();
    const mutator = createVocabularyMutator(env.app, PATH);

    env.setFailWrite(true);
    await mutator.mutate(editWeight("A", 2));
    env.setFailWrite(false);
    const outcome = await mutator.mutate(editWeight("B", 3));

    expect(outcome.result).toBe("written");
    expect(env.weightOf("B")).toBe(3);
  });

  it("skips the write when the transform declines", async () => {
    const env = seeded();
    const mutator = createVocabularyMutator(env.app, PATH);
    const before = env.files.get(PATH);

    const outcome = await mutator.mutate(() => null);

    expect(outcome.result).toBe("skipped");
    expect(env.files.get(PATH)).toBe(before);
  });

  it("picks up a change written outside the panel instead of reverting it", async () => {
    const env = seeded();
    const mutator = createVocabularyMutator(env.app, PATH);

    env.files.set(PATH, JSON.stringify({ terms: [term("A"), term("B"), term("EXTERNAL")] }, null, 2));
    await mutator.mutate(editWeight("A", 2));

    expect(env.terms().map((x) => x.label)).toEqual(["A", "B", "EXTERNAL"]);
    expect(env.weightOf("A")).toBe(2);
  });
});
