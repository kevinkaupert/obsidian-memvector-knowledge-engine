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
  Notice: class {},
}));

const PATH = "wiki/relation-types.json";

function term(label: string, extra: Partial<RelationTermDef> = {}): RelationTermDef {
  return { key: label.toLowerCase(), label, term: label, category: "Custom", bidirectional: false, reversed: false, ...extra };
}

/**
 * Models Vault.process: the read-modify-write runs as one atomic section, and concurrent
 * calls on the same file are serialized rather than interleaved.
 */
function fakeApp(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  let failWrite = false;
  let queue: Promise<unknown> = Promise.resolve();
  let concurrent = 0;
  let maxConcurrent = 0;

  const vault = {
    getAbstractFileByPath: (path: string) => (files.has(path) ? new MockTFile(path) : null),
    process: (file: TFile, fn: (data: string) => string) => {
      const run = async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        try {
          // Yield once inside the section: a non-atomic implementation would let a
          // second mutation read the pre-write contents here.
          await Promise.resolve();
          const before = files.get(file.path);
          if (before === undefined) throw new Error(`no file ${file.path}`);
          const after = fn(before);
          if (failWrite) throw new Error("write boom");
          files.set(file.path, after);
          return after;
        } finally {
          concurrent--;
        }
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };

  return {
    app: { vault } as unknown as App,
    files,
    setFailWrite: (v: boolean) => (failWrite = v),
    maxConcurrent: () => maxConcurrent,
    terms: (): RelationTermDef[] => JSON.parse(files.get(PATH)!).terms,
    find: (label: string) => (JSON.parse(files.get(PATH)!).terms as RelationTermDef[]).find((x) => x.label === label),
  };
}

function seeded(terms: RelationTermDef[] = [term("A"), term("B")]) {
  return fakeApp({ [PATH]: JSON.stringify({ terms }, null, 2) });
}

/** What the Settings weight field does: patch only the weight. */
const editWeight = (label: string, weight: number) => (current: RelationTermDef[]) =>
  current.map((x) => (x.label.toUpperCase() === label.toUpperCase() ? applyLayoutEdit(x, { weight }) : x));

/** What the Settings repels checkbox does: patch only repels. */
const editRepels = (label: string, repels: boolean) => (current: RelationTermDef[]) =>
  current.map((x) => (x.label.toUpperCase() === label.toUpperCase() ? applyLayoutEdit(x, { repels }) : x));

describe("createVocabularyMutator", () => {
  it("keeps an earlier weight edit when a second row is edited afterwards", async () => {
    const env = seeded();
    const m = createVocabularyMutator(env.app, PATH);

    await m.mutate(editWeight("A", 2));
    await m.mutate(editWeight("B", 3));

    expect(env.find("A")?.weight).toBe(2);
    expect(env.find("B")?.weight).toBe(3);
  });

  it("keeps a weight edit when another row is deleted afterwards", async () => {
    const env = seeded();
    const m = createVocabularyMutator(env.app, PATH);

    await m.mutate(editWeight("A", 2));
    await m.mutate((current) => current.filter((x) => x.label !== "B"));

    expect(env.find("A")?.weight).toBe(2);
    expect(env.terms().map((x) => x.label)).toEqual(["A"]);
  });

  it("keeps a weight edit when a type is added afterwards", async () => {
    const env = seeded();
    const m = createVocabularyMutator(env.app, PATH);

    await m.mutate(editWeight("A", 2));
    await m.mutate((current) => [...current, term("C")]);

    expect(env.find("A")?.weight).toBe(2);
    expect(env.terms().map((x) => x.label)).toEqual(["A", "B", "C"]);
  });

  it("does not revert a repels change made elsewhere when a weight is edited", async () => {
    // Regression: the weight handler used to send the checkbox state it had rendered with.
    const env = seeded([term("CONFLICTS_WITH")]);
    const m = createVocabularyMutator(env.app, PATH);

    // Another writer turns repulsion off explicitly.
    await m.mutate(editRepels("CONFLICTS_WITH", false));
    expect(env.find("CONFLICTS_WITH")?.repels).toBe(false);

    // A weight edit from a table still showing the old state must not resurrect repels.
    await m.mutate(editWeight("CONFLICTS_WITH", 2));

    expect(env.find("CONFLICTS_WITH")?.repels).toBe(false);
    expect(env.find("CONFLICTS_WITH")?.weight).toBe(2);
  });

  it("does not revert a weight change made elsewhere when repels is toggled", async () => {
    const env = seeded([term("A")]);
    const m = createVocabularyMutator(env.app, PATH);

    await m.mutate(editWeight("A", 2.5));
    await m.mutate(editRepels("A", true));

    expect(env.find("A")?.weight).toBe(2.5);
    expect(env.find("A")?.repels).toBe(true);
  });

  it("serializes concurrent mutations from two independent table instances", async () => {
    const env = seeded();
    // Two separately rendered Settings tables, each with its own mutator.
    const tableOne = createVocabularyMutator(env.app, PATH);
    const tableTwo = createVocabularyMutator(env.app, PATH);

    await Promise.all([tableOne.mutate(editWeight("A", 2)), tableTwo.mutate(editWeight("B", 3))]);

    expect(env.find("A")?.weight).toBe(2);
    expect(env.find("B")?.weight).toBe(3);
    expect(env.maxConcurrent()).toBe(1);
  });

  it("serializes an add from one table against a delete from another", async () => {
    const env = seeded();
    const tableOne = createVocabularyMutator(env.app, PATH);
    const tableTwo = createVocabularyMutator(env.app, PATH);

    await Promise.all([
      tableOne.mutate((current) => [...current, term("C")]),
      tableTwo.mutate((current) => current.filter((x) => x.label !== "A")),
    ]);

    expect(env.terms().map((x) => x.label).sort()).toEqual(["B", "C"]);
  });

  it("aborts without writing when the file contains invalid JSON", async () => {
    const env = fakeApp({ [PATH]: "{ not json" });
    const m = createVocabularyMutator(env.app, PATH);

    const outcome = await m.mutate(editWeight("A", 2));

    expect(outcome.result).toBe("read-failed");
    expect(env.files.get(PATH)).toBe("{ not json");
  });

  it("aborts without writing when the file has no terms array", async () => {
    const env = fakeApp({ [PATH]: JSON.stringify({ somethingElse: true }) });
    const m = createVocabularyMutator(env.app, PATH);

    const outcome = await m.mutate(() => [term("A")]);

    expect(outcome.result).toBe("read-failed");
    expect(env.terms).toBeDefined();
    expect(JSON.parse(env.files.get(PATH)!).terms).toBeUndefined();
  });

  it("aborts without writing when the file is missing entirely", async () => {
    const env = fakeApp();
    const m = createVocabularyMutator(env.app, PATH);

    const outcome = await m.mutate(() => [term("A")]);

    expect(outcome.result).toBe("read-failed");
    expect(env.files.has(PATH)).toBe(false);
  });

  it("reports a write failure and leaves the file untouched", async () => {
    const env = seeded();
    const m = createVocabularyMutator(env.app, PATH);
    const before = env.files.get(PATH);

    env.setFailWrite(true);
    const outcome = await m.mutate(editWeight("A", 2));

    expect(outcome.result).toBe("write-failed");
    expect(env.files.get(PATH)).toBe(before);
  });

  it("keeps serving later mutations after one failed", async () => {
    const env = seeded();
    const m = createVocabularyMutator(env.app, PATH);

    env.setFailWrite(true);
    await m.mutate(editWeight("A", 2));
    env.setFailWrite(false);
    const outcome = await m.mutate(editWeight("B", 3));

    expect(outcome.result).toBe("written");
    expect(env.find("B")?.weight).toBe(3);
  });

  it("skips the write when the transform declines", async () => {
    const env = seeded();
    const m = createVocabularyMutator(env.app, PATH);
    const before = env.files.get(PATH);

    const outcome = await m.mutate(() => null);

    expect(outcome.result).toBe("skipped");
    expect(env.files.get(PATH)).toBe(before);
  });

  it("reads the contents inside the atomic section, not when the mutation is requested", async () => {
    const env = seeded();
    const m = createVocabularyMutator(env.app, PATH);

    // Started but not awaited; the file then changes before the atomic section runs.
    const pending = m.mutate(editWeight("A", 2));
    env.files.set(PATH, JSON.stringify({ terms: [term("A"), term("B"), term("LATE")] }, null, 2));
    await pending;

    // A read taken at request time would have dropped LATE again.
    expect(env.terms().map((x) => x.label)).toEqual(["A", "B", "LATE"]);
    expect(env.find("A")?.weight).toBe(2);
  });

  it("picks up a change written outside the panel instead of reverting it", async () => {
    const env = seeded();
    const m = createVocabularyMutator(env.app, PATH);

    env.files.set(PATH, JSON.stringify({ terms: [term("A"), term("B"), term("EXTERNAL")] }, null, 2));
    await m.mutate(editWeight("A", 2));

    expect(env.terms().map((x) => x.label)).toEqual(["A", "B", "EXTERNAL"]);
    expect(env.find("A")?.weight).toBe(2);
  });
});
