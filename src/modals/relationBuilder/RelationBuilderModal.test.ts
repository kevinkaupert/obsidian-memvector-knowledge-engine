import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { RelationBuilderModal, type InitialRelationEdge } from "./RelationBuilderModal";
import { buildRelationFileContent } from "./relationFileTemplate";
import { loadRelationEdges, loadRelationFiles } from "../../views/vectorScatter/relationEdges";
import { loadRelationVocabulary } from "../../relationVocabulary/loadRelationVocabulary";
import { getGraphStore } from "../../sync/storeFactory";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { getTranslation } from "../../i18n";
import type { SettingsHost } from "../../settings/types";
import type { GraphStore } from "../../sync/graphStore";
import type { RelationTermDef } from "../../relationVocabulary/types";

// Only the Obsidian UI/storage boundary is mocked: save, resolution, file loading,
// duplicate detection and markdown generation run together as in the live modal.
class ElementStub {
  children: ElementStub[] = [];
  style = {};
  value = "";
  text = "";
  cls = "";
  disabled = false;
  onclick?: () => void | Promise<void>;
  onchange?: () => void;
  constructor(public tag = "div") {}
  createEl(tag: string, options: { text?: string; cls?: string; value?: string } = {}): ElementStub {
    const child = Object.assign(new ElementStub(tag), options);
    this.children.push(child);
    return child;
  }
  createDiv(options = {}): ElementStub { return this.createEl("div", options); }
  createSpan(options = {}): ElementStub { return this.createEl("span", options); }
  empty(): void { this.children = []; }
  addClass(): void {}
  setText(text: string): void { this.text = text; }
  find(predicate: (el: ElementStub) => boolean): ElementStub | undefined {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.find(predicate);
      if (found) return found;
    }
  }
}

vi.mock("obsidian", () => ({
  TFile: class {}, TFolder: class {}, Notice: vi.fn(),
  Modal: class {
    contentEl = new ElementStub();
    modalEl = new ElementStub();
    constructor(public app: App) {}
    close = vi.fn();
  },
}));
vi.mock("../../relationVocabulary/loadRelationVocabulary", () => ({ loadRelationVocabulary: vi.fn() }));
vi.mock("../../sync/storeFactory", () => ({ getGraphStore: vi.fn() }));

const a = { id: "a", path: "A.md", title: "A", type: "concept" };
const b = { id: "b", path: "B.md", title: "B", type: "concept" };
const reversed: RelationTermDef = {
  key: "relDerivedFrom", label: "DERIVED_FROM", term: "derived from", category: "Test", reversed: true, bidirectional: false,
};
const host = { settings: { ...DEFAULT_SETTINGS, language: "en", vectorSearchExclusions: "-path:wiki/relations" } } as SettingsHost;

function fixture(def: RelationTermDef) {
  vi.mocked(loadRelationVocabulary).mockResolvedValue([def]);
  const contents = new Map<string, string>([[a.path, "A"], [b.path, "B"]]);
  const file = (path: string) => Object.assign(new TFile(), { path, name: path.split("/").pop()!, basename: path.split("/").pop()!.slice(0, -3) });
  const create = vi.fn(async (path: string, content: string) => { contents.set(path, content); });
  const modify = vi.fn(async (f: TFile, content: string) => { contents.set(f.path, content); });
  const trashFile = vi.fn(async (f: TFile) => { contents.delete(f.path); });
  const app = {
    vault: {
      getMarkdownFiles: () => [...contents.keys()].map(file),
      getAbstractFileByPath: (path: string) => contents.has(path) ? file(path) : null,
      read: async (f: TFile) => contents.get(f.path)!,
      create, modify, createFolder: vi.fn(async () => {}),
    },
    metadataCache: {
      getFileCache: () => null, // Exercise the real markdown fallback in the loader.
      getFirstLinkpathDest: (link: string) => contents.has(`${link}.md`) ? file(`${link}.md`) : null,
    },
    fileManager: { trashFile },
  } as unknown as App;
  const store = { upsertTypedEdges: vi.fn(async () => {}), deleteEdge: vi.fn(async () => {}) };
  vi.mocked(getGraphStore).mockReturnValue(store as unknown as GraphStore);

  async function open(nodes = [a, b], initial?: InitialRelationEdge) {
    const modal = new RelationBuilderModal(app, host, nodes, initial);
    modal.onOpen();
    const root = modal.contentEl as unknown as ElementStub;
    await vi.waitFor(() => expect(root.find((el) => el.cls === "memvector-relation-save-btn")).toBeDefined());
    return {
      modal, root,
      save: async () => { await root.find((el) => el.cls === "memvector-relation-save-btn")!.onclick!(); },
    };
  }
  return { app, contents, create, modify, trashFile, store, open };
}

beforeEach(() => vi.clearAllMocks());

describe("Relation Builder save integration", () => {
  it.each([false, true])("honors the reversed default with or without dropdown interaction (explicit: %s)", async (explicit) => {
    const f = fixture(reversed);
    const ui = await f.open();
    if (explicit) {
      const select = ui.root.find((el) => el.tag === "select")!;
      select.value = reversed.label;
      select.onchange!();
    }
    await ui.save();
    const [saved] = await loadRelationFiles(f.app);
    expect([saved.srcId, saved.tgtId, saved.relType]).toEqual(["b", "a", reversed.label]);
    expect(f.store.upsertTypedEdges).toHaveBeenCalledWith([expect.objectContaining({ src: b, tgt: a })]);
  });

  it("persists the bidirectional default without dropdown interaction", async () => {
    const f = fixture({ ...reversed, label: "EQUIVALENT_TO", reversed: false, bidirectional: true });
    await (await f.open()).save();
    expect([...f.contents.values()].some((content) => content.includes("bidirectional: true"))).toBe(true);
    expect(f.store.upsertTypedEdges).toHaveBeenCalledWith([expect.objectContaining({ bidirectional: true })]);
  });

  it.each([false, true])("preserves canonical edit direction and supports an explicit swap (swap: %s)", async (swap) => {
    const f = fixture(reversed);
    const path = "wiki/relations/existing.md";
    f.contents.set(path, buildRelationFileContent({ src: b, tgt: a, label: reversed.label, bidirectional: false, originalTerm: reversed.label }, "Original", getTranslation("en")));
    for (let attempt = 0; attempt < 2; attempt++) {
      const [stored] = await loadRelationFiles(f.app);
      const nodes = stored.srcId === "b" ? [b, a] : [a, b];
      const ui = await f.open(nodes, { ...stored, description: stored.desc });
      if (swap && attempt === 0) await ui.root.find((el) => el.cls === "memvector-flow-swap-btn")!.onclick!();
      const preview = ui.root.find((el) => el.cls === "memvector-cypher-box")!.text;
      expect(preview).toContain(`source_path: "${swap ? a.path : b.path}", target_path: "${swap ? b.path : a.path}"`);
      await ui.save();
      const [saved] = await loadRelationFiles(f.app);
      expect([saved.srcId, saved.tgtId]).toEqual(swap ? ["a", "b"] : ["b", "a"]);
      expect(f.store.upsertTypedEdges).toHaveBeenLastCalledWith([expect.objectContaining({ src: swap ? a : b, tgt: swap ? b : a })]);
    }
    if (!swap) {
      expect(f.create).not.toHaveBeenCalled();
      expect(f.trashFile).not.toHaveBeenCalled();
      expect(f.modify).toHaveBeenCalledTimes(2);
    }
  });

  it("preserves direction and migrates to canonical label when editing an edge stored with a legacy term key (Issue #108)", async () => {
    const f = fixture(reversed);
    const path = "wiki/relations/legacy-edge.md";
    // File was saved with legacy key "relDerivedFrom"
    f.contents.set(path, buildRelationFileContent({ src: b, tgt: a, label: reversed.key, bidirectional: false, originalTerm: reversed.key }, "Original", getTranslation("en")));
    const [stored] = await loadRelationFiles(f.app);
    expect(stored.relType).toBe("RELDERIVEDFROM");

    // Open modal to edit without modifying direction
    const ui = await f.open([b, a], { ...stored, description: stored.desc });
    await ui.save();

    const [saved] = await loadRelationFiles(f.app);
    // Endpoints must not flip
    expect([saved.srcId, saved.tgtId]).toEqual(["b", "a"]);
    // Must be migrated to canonical label
    expect(saved.relType).toBe("DERIVED_FROM");
    expect(f.store.upsertTypedEdges).toHaveBeenCalledWith([expect.objectContaining({ src: b, tgt: a, relType: "DERIVED_FROM" })]);
  });

  it.each(["first", "second"])("rejects duplicate files before any writes when editing %s", async (edited) => {
    const f = fixture({ ...reversed, reversed: false });
    const content = buildRelationFileContent({ src: a, tgt: b, label: reversed.label, bidirectional: false, originalTerm: reversed.label }, "Original", getTranslation("en"));
    for (const name of ["first", "second"]) f.contents.set(`wiki/relations/${name}.md`, content);
    expect(await loadRelationEdges(f.app)).toHaveLength(1);
    expect(await loadRelationFiles(f.app)).toHaveLength(2);
    const before = [...f.contents];
    const ui = await f.open([a, b], { path: `wiki/relations/${edited}.md`, relType: reversed.label, srcId: "a", tgtId: "b", description: "Edited" });
    await ui.save();
    expect([...f.contents]).toEqual(before);
    expect(f.create).not.toHaveBeenCalled();
    expect(f.modify).not.toHaveBeenCalled();
    expect(f.trashFile).not.toHaveBeenCalled();
    expect(f.store.upsertTypedEdges).not.toHaveBeenCalled();
    expect(f.store.deleteEdge).not.toHaveBeenCalled();
    expect(ui.modal.close).not.toHaveBeenCalled();
  });

  it("does not mutate the caller's selectedNodes array on swap (#83)", async () => {
    const f = fixture({ ...reversed, reversed: false });
    const originalArray = [a, b];
    const ui = await f.open(originalArray);
    const swapBtn = ui.root.find((el) => el.cls === "memvector-flow-swap-btn")!;
    await swapBtn.onclick!();
    expect(originalArray[0]).toBe(a);
    expect(originalArray[1]).toBe(b);
  });
});

