import { describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { renderTypeTable } from "./relationTypesSection";
import { getTranslation } from "../../i18n";
import type { SettingsHost } from "../types";
import type { RelationTermDef } from "../../relationVocabulary/types";
import { withBundledLayoutDefaults } from "../../relationVocabulary/layoutDefaults";

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
    constructor(public message: string) {}
  },
  Modal: class {},
  Setting: class {},
}));

const PATH = "wiki/relation-types.json";
const t = getTranslation("en");

/** Minimal stand-in for the Obsidian-extended HTMLElement API this table uses. */
interface FakeEl {
  tag: string;
  text: string;
  type?: string;
  value: string;
  checked: boolean;
  children: FakeEl[];
  onchange?: () => void;
  onclick?: () => void;
  [key: string]: unknown;
}

function el(tag: string, opts?: { text?: string; cls?: string; type?: string; placeholder?: string }): FakeEl {
  const node: FakeEl = {
    tag,
    text: opts?.text ?? "",
    type: opts?.type,
    value: "",
    checked: false,
    children: [],
    createEl: (t2: string, o?: never) => {
      const child = el(t2, o);
      node.children.push(child);
      return child;
    },
    createDiv: (o?: never) => (node.createEl as (t: string, o?: never) => FakeEl)("div", o),
    createSpan: (o?: never) => (node.createEl as (t: string, o?: never) => FakeEl)("span", o),
    addClass: () => undefined,
    removeClass: () => undefined,
    setText: (v: string) => {
      node.text = v;
    },
    setAttribute: () => undefined,
    prepend: () => undefined,
    empty: () => {
      node.children = [];
    },
  };
  return node;
}

/** The table only uses the subset of the element API modelled above. */
const asEl = (node: FakeEl): HTMLElement => node as unknown as HTMLElement;

function walk(node: FakeEl, out: FakeEl[] = []): FakeEl[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}

/** Fake vault modelling Vault.process: atomic section, concurrent calls serialized. */
function fakeApp(terms: RelationTermDef[]) {
  const files = new Map([[PATH, JSON.stringify({ terms }, null, 2)]]);
  let queue: Promise<unknown> = Promise.resolve();
  const vault = {
    getAbstractFileByPath: (p: string) => (files.has(p) ? new MockTFile(p) : null),
    process: (file: TFile, fn: (data: string) => string) => {
      const run = async () => {
        await Promise.resolve();
        const before = files.get(file.path)!;
        const after = fn(before);
        files.set(file.path, after);
        return after;
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };
  return {
    app: { vault } as unknown as App,
    files,
    saved: (): RelationTermDef[] => JSON.parse(files.get(PATH)!).terms,
    find: (label: string) => (JSON.parse(files.get(PATH)!).terms as RelationTermDef[]).find((x) => x.label === label),
    writeExternally: (next: RelationTermDef[]) => files.set(PATH, JSON.stringify({ terms: next }, null, 2)),
  };
}

function renderTable(app: App, terms: RelationTermDef[]) {
  const parent = el("div");
  const host = {
    settings: { relationVocabularyPath: PATH },
    saveSettings: async () => undefined,
    applySettingsToOpenViews: () => undefined,
  } as unknown as SettingsHost;
  // The table renders from the loader's view of the file, defaults already filled in.
  renderTypeTable(asEl(parent), withBundledLayoutDefaults(terms), PATH, app, host, t, () => undefined);
  const all = walk(parent);
  const inputs = all.filter((n) => n.tag === "input");
  return {
    weightInput: inputs.find((n) => n.type === "number")!,
    repelsInput: inputs.find((n) => n.type === "checkbox")!,
    deleteButton: all.find((n) => n.tag === "button" && n.text === "✕")!,
  };
}

const conflicts: RelationTermDef = {
  key: "relConflictsWith",
  label: "CONFLICTS_WITH",
  term: "conflicts with",
  category: "Logic & Implication",
  bidirectional: true,
  reversed: false,
  repels: true,
};

/** Lets the handler's fire-and-forget promise chain settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("relation type table handlers", () => {
  it("writes only the weight when the weight field changes", async () => {
    const env = fakeApp([conflicts]);
    const table = renderTable(env.app, [conflicts]);

    table.weightInput.value = "2";
    table.weightInput.onchange!();
    await settle();

    expect(env.find("CONFLICTS_WITH")?.weight).toBe(2);
    expect(env.find("CONFLICTS_WITH")?.repels).toBe(true);
  });

  it("does not revert a repels change made elsewhere when the weight is edited", async () => {
    const env = fakeApp([conflicts]);
    // Table rendered while repulsion is still on.
    const table = renderTable(env.app, [conflicts]);

    // Someone else turns it off - another window, or the file edited directly.
    env.writeExternally([{ ...conflicts, repels: false, weight: 1 }]);

    table.weightInput.value = "2";
    table.weightInput.onchange!();
    await settle();

    expect(env.find("CONFLICTS_WITH")?.repels).toBe(false);
    expect(env.find("CONFLICTS_WITH")?.weight).toBe(2);
  });

  it("does not revert a weight change made elsewhere when repels is toggled", async () => {
    const env = fakeApp([conflicts]);
    const table = renderTable(env.app, [conflicts]);

    env.writeExternally([{ ...conflicts, weight: 3, repels: true }]);

    table.repelsInput.checked = false;
    table.repelsInput.onchange!();
    await settle();

    expect(env.find("CONFLICTS_WITH")?.weight).toBe(3);
    expect(env.find("CONFLICTS_WITH")?.repels).toBe(false);
  });

  it("keeps the first edit when a second row is edited from the same table", async () => {
    const a: RelationTermDef = { key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false };
    const b: RelationTermDef = { key: "b", label: "B", term: "b", category: "C", bidirectional: false, reversed: false };
    const env = fakeApp([a, b]);
    const parent = el("div");
    const host = {
      settings: { relationVocabularyPath: PATH },
      saveSettings: async () => undefined,
      applySettingsToOpenViews: () => undefined,
    } as unknown as SettingsHost;
    renderTypeTable(asEl(parent), [a, b], PATH, env.app, host, t, () => undefined);
    const numbers = walk(parent).filter((n) => n.tag === "input" && n.type === "number");

    numbers[0].value = "2";
    numbers[0].onchange!();
    numbers[1].value = "3";
    numbers[1].onchange!();
    await settle();

    expect(env.find("A")?.weight).toBe(2);
    expect(env.find("B")?.weight).toBe(3);
  });

  it("keeps concurrent edits from two independently rendered tables", async () => {
    const a: RelationTermDef = { key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false };
    const b: RelationTermDef = { key: "b", label: "B", term: "b", category: "C", bidirectional: false, reversed: false };
    const env = fakeApp([a, b]);

    const parentOne = el("div");
    const parentTwo = el("div");
    const host = {
      settings: { relationVocabularyPath: PATH },
      saveSettings: async () => undefined,
      applySettingsToOpenViews: () => undefined,
    } as unknown as SettingsHost;
    renderTypeTable(asEl(parentOne), [a, b], PATH, env.app, host, t, () => undefined);
    renderTypeTable(asEl(parentTwo), [a, b], PATH, env.app, host, t, () => undefined);

    const one = walk(parentOne).filter((n) => n.tag === "input" && n.type === "number");
    const two = walk(parentTwo).filter((n) => n.tag === "input" && n.type === "number");

    // Fired back to back, before either write has settled.
    one[0].value = "2";
    one[0].onchange!();
    two[1].value = "3";
    two[1].onchange!();
    await settle();

    expect(env.find("A")?.weight).toBe(2);
    expect(env.find("B")?.weight).toBe(3);
  });

  it("keeps a weight edit when a row is deleted right afterwards", async () => {
    const a: RelationTermDef = { key: "a", label: "A", term: "a", category: "C", bidirectional: false, reversed: false };
    const b: RelationTermDef = { key: "b", label: "B", term: "b", category: "C", bidirectional: false, reversed: false };
    const env = fakeApp([a, b]);
    const parent = el("div");
    const host = {
      settings: { relationVocabularyPath: PATH },
      saveSettings: async () => undefined,
      applySettingsToOpenViews: () => undefined,
    } as unknown as SettingsHost;
    renderTypeTable(asEl(parent), [a, b], PATH, env.app, host, t, () => undefined);
    const all = walk(parent);
    const numbers = all.filter((n) => n.tag === "input" && n.type === "number");
    const deletes = all.filter((n) => n.tag === "button" && n.text === "✕");

    numbers[0].value = "2";
    numbers[0].onchange!();
    deletes[1].onclick!();
    await settle();

    expect(env.saved().map((x) => x.label)).toEqual(["A"]);
    expect(env.find("A")?.weight).toBe(2);
  });
});
