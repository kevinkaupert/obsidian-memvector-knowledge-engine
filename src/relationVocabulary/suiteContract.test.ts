import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import {
  activeVocabularyFromKnowos,
  backupPath,
  migrateActiveVocabulary,
  migrateVocabulary,
  serializeVocabulary,
  vocabularyPathFromKnowos,
  writeKnowosVocabulary,
} from "./suiteContract";
import { createVocabularyMutator } from "./vocabularyMutations";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
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

vi.mock("obsidian", () => ({ TFile: MockTFile, TFolder: MockTFile, Notice: class {} }));

function vault(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => (files.has(p) ? new MockTFile(p) : null),
      read: async (f: { path: string }) => files.get(f.path)!,
      cachedRead: async (f: { path: string }) => files.get(f.path)!,
      create: async (p: string, d: string) => {
        if (files.has(p)) throw new Error("exists");
        files.set(p, d);
      },
      modify: async (f: { path: string }, d: string) => {
        files.set(f.path, d);
      },
      process: async (f: { path: string }, fn: (d: string) => string) => {
        files.set(f.path, fn(files.get(f.path)!));
      },
    },
  } as unknown as App;
  return { app, files };
}

function t(key: string, label: string, extra: Record<string, unknown> = {}) {
  return { key, label, term: label.toLowerCase(), category: "C", bidirectional: false, reversed: false, ...extra };
}

/** The 13-label vocabulary of vaults set up before the contract (no DEFINED_BY, no EXAMPLE_OF). */
const PRE_CONTRACT = {
  terms: ["IMPLIES", "EQUIVALENT_TO", "CONFLICTS_WITH", "INDEPENDENT_OF", "REQUIRES", "GENERALIZES", "SPECIALIZES",
    "EXTENDS", "REDUCES_TO", "CONSTRUCTS", "EMBEDS_IN", "REFUTES", "ANALOGOUS_TO"].map((l) => t(l.toLowerCase(), l)),
};

describe("relation vocabulary contract (knowOS ADR-0011)", () => {
  it("the default vocabulary has the six canvas slots of contract section 7", () => {
    const slots = Object.fromEntries(DEFAULT_RELATION_VOCABULARY.filter((d) => d.canvas).map((d) => [d.canvas!.slot, [d.label, d.canvas!.subject]]));
    expect(slots).toEqual({
      N: ["REQUIRES", "source"], S: ["IMPLIES", "source"], "E-up": ["GENERALIZES", "new"],
      "E-down": ["EXAMPLE_OF", "new"], "W-up": ["DEFINED_BY", "source"], "W-down": ["REFUTES", "new"],
    });
  });

  it("serializing keeps top-level fields and unusable entries", () => {
    const out = JSON.parse(serializeVocabulary({ schema: 1, name: "Recht", future: { x: 1 }, terms: [] }, [t("a", "A") as RelationTermDef], [{ broken: true }]));
    expect(out).toEqual({ schema: 1, name: "Recht", future: { x: 1 }, terms: [t("a", "A"), { broken: true }] });
  });

  it("a MemVector edit keeps schema, name, canvas slots and entries it cannot read", async () => {
    const file = { schema: 1, name: "Recht", terms: [t("a", "A", { canvas: { slot: "N", subject: "source" }, future: 1 }), { key: "kaputt" }] };
    const { app, files } = vault({ "p.json": JSON.stringify(file) });
    const result = await createVocabularyMutator(app, () => "p.json").mutate((terms) => [...terms, t("b", "B") as RelationTermDef]);
    expect(result.result).toBe("written");
    expect(JSON.parse(files.get("p.json")!)).toEqual({ ...file, terms: [file.terms[0], t("b", "B"), { key: "kaputt" }] });
  });

  it("reads the active preset from knowos.json only when it names an existing file", async () => {
    expect(vocabularyPathFromKnowos('{"relation_vocabulary": "/wiki/presets/recht.json"}')).toBe("wiki/presets/recht.json");
    expect(vocabularyPathFromKnowos("kein json")).toBeNull();
    expect(vocabularyPathFromKnowos('{"relation_vocabulary": 3}')).toBeNull();
    const { app } = vault({ "knowos.json": '{"relation_vocabulary": "wiki/presets/recht.json"}' });
    expect(await activeVocabularyFromKnowos(app)).toBeNull();
    const withFile = vault({ "knowos.json": '{"relation_vocabulary": "wiki/presets/recht.json"}', "wiki/presets/recht.json": "{}" });
    expect(await activeVocabularyFromKnowos(withFile.app)).toBe("wiki/presets/recht.json");
  });

  it("a preset switch writes knowos.json, keeping its other keys; an unreadable file is not overwritten", async () => {
    const fresh = vault();
    await writeKnowosVocabulary(fresh.app, "wiki/presets/recht.json");
    expect(JSON.parse(fresh.files.get("knowos.json")!)).toEqual({ relation_vocabulary: "wiki/presets/recht.json" });

    const other = vault({ "knowos.json": '{"later": true, "relation_vocabulary": "alt.json"}' });
    await writeKnowosVocabulary(other.app, "neu.json");
    expect(JSON.parse(other.files.get("knowos.json")!)).toEqual({ later: true, relation_vocabulary: "neu.json" });

    const broken = vault({ "knowos.json": "[1, 2]" });
    await expect(writeKnowosVocabulary(broken.app, "neu.json")).rejects.toThrow(/not a JSON object/);
    expect(broken.files.get("knowos.json")).toBe("[1, 2]");
  });

  it("migrates a pre-contract STEM file: adds DEFINED_BY and EXAMPLE_OF, sets the slots, keeps everything else", () => {
    const m = migrateVocabulary({ ...PRE_CONTRACT, name: "alt" })!;
    expect(m.added).toEqual(["DEFINED_BY", "EXAMPLE_OF"]);
    expect(m.slotted).toEqual(["IMPLIES", "REQUIRES", "GENERALIZES", "REFUTES"]);
    expect(m.data.schema).toBe(1);
    expect(m.data.name).toBe("alt");
    const terms = m.data.terms as Array<Record<string, unknown>>;
    expect(terms.slice(0, 13).map((x) => x.label)).toEqual(PRE_CONTRACT.terms.map((x) => x.label));
    expect(terms.find((x) => x.label === "EXAMPLE_OF")!.canvas).toEqual({ slot: "E-down", subject: "new" });
    expect(terms.find((x) => x.label === "SPECIALIZES")!.canvas).toBeUndefined();
  });

  it("does not migrate files with schema, with any canvas field, or without a default label", () => {
    expect(migrateVocabulary({ schema: 1, terms: PRE_CONTRACT.terms })).toBeNull();
    expect(migrateVocabulary({ terms: [t("r", "REQUIRES", { canvas: { slot: "S", subject: "new" } })] })).toBeNull();
    expect(migrateVocabulary({ terms: [t("b", "BASED_ON"), t("i", "IMPLEMENTS")] })).toBeNull();
    expect(migrateVocabulary("kein Objekt")).toBeNull();
  });

  it("writes a backup before migrating, says what it did, and never overwrites an existing backup", async () => {
    const raw = JSON.stringify(PRE_CONTRACT);
    const { app, files } = vault({ "wiki/relation-types.json": raw });
    const notices: string[] = [];
    expect(await migrateActiveVocabulary(app, "wiki/relation-types.json", (m) => notices.push(m))).toBe("migrated");
    expect(files.get(backupPath("wiki/relation-types.json"))).toBe(raw);
    expect(backupPath("wiki/relation-types.json")).toBe("wiki/relation-types.pre-schema1.json");
    expect(JSON.parse(files.get("wiki/relation-types.json")!).schema).toBe(1);
    expect(notices[0]).toMatch(/added DEFINED_BY, EXAMPLE_OF.*relation-types\.pre-schema1\.json/);
    expect(await migrateActiveVocabulary(app, "wiki/relation-types.json", (m) => notices.push(m))).toBe("unchanged");

    const blocked = vault({ "v.json": raw, "v.pre-schema1.json": "eigene Sicherung" });
    expect(await migrateActiveVocabulary(blocked.app, "v.json", () => {})).toBe("backup-exists");
    expect(blocked.files.get("v.json")).toBe(raw);
    expect(blocked.files.get("v.pre-schema1.json")).toBe("eigene Sicherung");
  });

  it("recovery: the backup with schema 1 added is never migrated again", () => {
    expect(migrateVocabulary({ ...PRE_CONTRACT, schema: 1 })).toBeNull();
  });
});
