import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import { getTranslation } from "./i18n";
import { enrichContext } from "./views/vectorScatter/contextEnrichment";
import { buildToolbar } from "./views/vectorScatter/toolbar/toolbar";
import type { ScatterViewContext } from "./views/vectorScatter/context";
import type { ScatterNode } from "./views/vectorScatter/types";
import { runSynthesis } from "./views/vectorScatter/synthesis";
import { callDirectLLM } from "./llm/callDirectLLM";
import { SynthesisResultModal } from "./modals/SynthesisResultModal";
import { renderActiveNoteFocus } from "./views/sidebar/renderActiveNoteFocus";
import { loadRadarNeighbors } from "./views/sidebar/radarNeighbors";
import { getNode2DPositions } from "./views/sidebar/nodePosition";

interface ElementOptions { text?: string; cls?: string; attr?: Record<string, string> }

/** Records the DOM contract without requiring an Obsidian desktop instance. */
class Element {
  children: Element[] = [];
  text = "";
  cls = "";
  attr: Record<string, string> = {};
  value = "";
  hidden = false;
  onclick?: () => Promise<void> | void;
  parentElement?: Element;
  classList = { toggle: vi.fn() };
  setText(text: string) { this.text = text; }
  setAttribute(key: string, value: string) { this.attr[key] = value; }
  addClass(cls: string) { this.cls += ` ${cls}`; }
  removeClass() {}
  toggleClass() {}
  empty() { this.children = []; }
  addEventListener() {}
  createDiv(options: ElementOptions = {}) { return this.createEl("div", options); }
  createSpan(options: ElementOptions = {}) { return this.createEl("span", options); }
  createEl(_tag: string, options: ElementOptions = {}) {
    const child = new Element();
    Object.assign(child, { text: options.text || "", cls: options.cls || "", attr: options.attr || {}, parentElement: this });
    this.children.push(child);
    return child;
  }
  getContext() {
    return new Proxy({}, { get: (_, key) => key === "createRadialGradient" ? () => ({ addColorStop: vi.fn() }) : vi.fn() });
  }
  all(): Element[] { return [this, ...this.children.flatMap((child) => child.all())]; }
}

const { renderedMarkdown, notices, opened } = vi.hoisted(() => ({ renderedMarkdown: vi.fn(), notices: vi.fn(), opened: vi.fn() }));
vi.mock("obsidian", () => ({
  TFile: class {},
  TFolder: class {},
  setIcon: vi.fn(),
  Notice: class { constructor(text: string) { notices(text); } },
  Modal: class {
    contentEl = new Element();
    constructor(public app: App) {}
    open() { opened(this); }
    close() {}
  },
  MarkdownRenderer: { render: renderedMarkdown },
}));
vi.mock("./views/vectorScatter/contextEnrichment", async (original) => ({
  ...await original<typeof import("./views/vectorScatter/contextEnrichment")>(),
  enrichContext: vi.fn(),
}));
vi.mock("./llm/callDirectLLM", () => ({ callDirectLLM: vi.fn() }));
vi.mock("./settings/secrets", () => ({ resolveApiKeyFor: () => "key" }));
vi.mock("./views/vectorScatter/relationEdges", () => ({ loadRelationEdges: async () => [] }));
vi.mock("./views/sidebar/radarNeighbors", () => ({ loadRadarNeighbors: vi.fn() }));
vi.mock("./views/sidebar/nodePosition", () => ({ getNode2DPositions: vi.fn() }));

const t = getTranslation("en");
const settings = { ...DEFAULT_SETTINGS, language: "en", enrichSynthesisContext: true, includeAgentsGuidelines: false };
const selected: ScatterNode = { id: "seed", path: "seed.md", title: "Seed", basenameKey: "seed", type: "concept", content: "Seed content", x: 0, y: 0, latexFormulas: [], links: [] };
const app = {
  vault: { getAbstractFileByPath: () => null, getMarkdownFiles: () => [], cachedRead: async () => "Seed content", createFolder: vi.fn(), create: vi.fn() },
  metadataCache: { getFileCache: () => null },
} as unknown as App;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", globalThis);
  vi.mocked(enrichContext).mockResolvedValue({ notes: [], channels: { vector: "error", graph: "ready" } });
  vi.mocked(callDirectLLM).mockResolvedValue({ content: "Answer", reasoning: "Reasoning" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("retrieval warnings at the user boundary (#192, #193)", () => {
  it("shows failed-channel feedback alongside preview seeds and updates the restored filter input", async () => {
    vi.useFakeTimers();
    const toolbarEl = new Element();
    const ctx = { app, settings, nodes: [selected], selectedNodeIds: new Set([selected.id]), redraw: vi.fn(), viewFilterQuery: "tag:#active" } as unknown as ScatterViewContext;
    const refs = { toolbarEl, canvas: new Element(), canvasWrap: new Element(), hoverBar: new Element() };
    const handles = buildToolbar(ctx, refs as unknown as Parameters<typeof buildToolbar>[1], t);
    handles.updateFilterQuery!("-path:archive");
    expect(toolbarEl.all().some((el) => el.value === "-path:archive")).toBe(true);
    handles.updateSelectionUI();
    await vi.advanceTimersByTimeAsync(400);
    expect(toolbarEl.all().filter((el) => el.cls === "memvector-retrieval-warning").map((el) => el.text)).toEqual([t.retrievalVectorFailed]);
    expect(toolbarEl.all().some((el) => el.text === "Seed")).toBe(true);
    expect(toolbarEl.all().some((el) => el.text === t.previewEmpty)).toBe(false);
  });

  it("preserves warning and reasoning in the result modal and saved synthesis note", async () => {
    await runSynthesis(app, settings, [selected], vi.fn());
    expect(notices).toHaveBeenCalledWith(t.retrievalVectorFailed);
    const modal = opened.mock.calls[0][0] as SynthesisResultModal;
    modal.onOpen();
    const content = modal.contentEl as unknown as Element;
    expect(content.all().some((el) => el.text === t.retrievalVectorFailed && el.attr.role === "status")).toBe(true);
    expect(renderedMarkdown.mock.calls[0][1]).toContain("> [!note]- Model reasoning\n> Reasoning\n\nAnswer");
    const save = content.all().find((el) => el.cls === "mod-cta")!;
    await save.onclick!();
    expect(vi.mocked(app.vault.create).mock.calls[0][1]).toContain(`> [!warning] ${t.retrievalVectorFailed}`);
    expect(vi.mocked(app.vault.create).mock.calls[0][1]).toContain("> [!note]- Model reasoning\n> Reasoning\n\nAnswer");
  });

  it.each(["error", "unindexed", "ready"] as const)("labels radar scores for %s retrieval", async (status) => {
    const file = { path: "other.md", name: "other.md", basename: "other" };
    vi.mocked(loadRadarNeighbors).mockResolvedValue({ status, data: [{ file, type: "concept", score: 0.875, content: "text", formulas: [] }] });
    vi.mocked(getNode2DPositions).mockResolvedValue(new Map([["seed.md", { x: 0, y: 0 }], ["other.md", { x: 1, y: 1 }]]));
    const container = new Element();
    await renderActiveNoteFocus(app, container as unknown as HTMLElement, settings, { path: "seed.md", name: "seed.md" } as Parameters<typeof renderActiveNoteFocus>[3]);
    const warnings = container.all().filter((el) => el.cls === "memvector-retrieval-warning");
    expect(warnings.map((el) => el.text)).toEqual(status === "ready" ? [] : [status === "error" ? t.radarStoreFailed : t.radarUnindexed]);
    const score = container.all().find((el) => el.cls === "memvector-radar-score")!;
    expect(score.text).toBe(status === "ready" ? "0.875" : "≈ 0.88");
    expect(score.attr.title).toBe(status === "ready" ? t.radarSemantic : t.radarHeuristic);
  });
});
