/**
 * Purpose: Characterization of the sidebar radar (#76): drawing calls, zoom, drag, reset, hover tooltip and click
 * navigation, recorded before renderActiveNoteFocus was split. The split must produce the same call log.
 */
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../settings/defaults";

vi.mock("obsidian", () => ({ TFile: class {}, setIcon: vi.fn() }));

const neighbors = vi.hoisted(() => ({ result: { status: "ready", data: [] as unknown[] } }));
const positions = vi.hoisted(() => ({ map: new Map<string, { x: number; y: number }>() }));
vi.mock("./radarNeighbors", () => ({ loadRadarNeighbors: vi.fn(async () => neighbors.result) }));
vi.mock("./nodePosition", () => ({ getNode2DPositions: vi.fn(async () => positions.map) }));

if (typeof window === "undefined") (globalThis as any).window = globalThis;

import { renderActiveNoteFocus } from "./renderActiveNoteFocus";

type Handler = (e: Record<string, unknown>) => void;

/** Element double that records class changes and keeps handlers so tests can fire them. */
class El {
  children: El[] = [];
  text = "";
  cls: string;
  hidden = false;
  open = false;
  title = "";
  style: Record<string, string> = {};
  clientWidth = 260;
  width = 0;
  height = 0;
  listeners: Record<string, Handler> = {};
  onclick: Handler | null = null;
  onmousedown: Handler | null = null;
  onmousemove: Handler | null = null;
  onmouseup: Handler | null = null;
  onmouseleave: Handler | null = null;
  ondblclick: Handler | null = null;
  classLog: string[] = [];
  ctx: ReturnType<typeof recordingContext> | null = null;
  constructor(public tag: string, opts: { cls?: string; text?: string } = {}) {
    this.cls = opts.cls ?? "";
    this.text = opts.text ?? "";
  }
  createEl(tag: string, opts: { cls?: string; text?: string } = {}): El {
    const c = new El(tag, opts);
    this.children.push(c);
    return c;
  }
  createDiv(opts: { cls?: string; text?: string } = {}): El {
    return this.createEl("div", opts);
  }
  createSpan(opts: { cls?: string; text?: string } = {}): El {
    return this.createEl("span", opts);
  }
  addClass(c: string): void {
    this.classLog.push(`+${c}`);
  }
  removeClass(c: string): void {
    this.classLog.push(`-${c}`);
  }
  setText(t: string): void {
    this.text = t;
  }
  addEventListener(type: string, fn: Handler): void {
    this.listeners[type] = fn;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }
  getContext() {
    this.ctx = recordingContext();
    return this.ctx.ctx;
  }
  all(): El[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}

/** 2D context double logging every call and property write, rounded for a readable snapshot. */
function recordingContext() {
  const log: string[] = [];
  const fmt = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 1000) / 1000) : typeof v === "object" ? "{gradient}" : JSON.stringify(v));
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_, key: string) {
      if (key === "createRadialGradient") {
        return (...args: unknown[]) => {
          log.push(`createRadialGradient(${args.map(fmt).join(",")})`);
          return { addColorStop: (o: number, c: string) => log.push(`  stop(${o},${c})`) };
        };
      }
      return (...args: unknown[]) => log.push(`${key}(${args.map(fmt).join(",")})`);
    },
    set(_, key: string, value: unknown) {
      log.push(`${key}=${fmt(value)}`);
      return true;
    },
  });
  return { ctx, log };
}

function file(name: string) {
  return { path: `wiki/${name}.md`, name: `${name}.md`, basename: name, extension: "md" };
}

async function render() {
  const active = file("Basis");
  const items = [
    { file: file("Vektorraum"), type: "concept", score: 0.9, formulas: [], content: "" },
    { file: file("Dimension"), type: "theorem", score: 1.4, formulas: [], content: "" }, // clamped to 1
    { file: file("Gruppe"), type: "definition", score: 0.3, formulas: [], content: "" },
    { file: file("Same"), type: "unknown", score: 0.5, formulas: [], content: "" }, // coincident with the active note
  ];
  neighbors.result = { status: "ready", data: items };
  positions.map = new Map([
    [active.path, { x: 0, y: 0 }],
    ["wiki/Vektorraum.md", { x: 10, y: 0 }],
    ["wiki/Dimension.md", { x: 0, y: -10 }],
    ["wiki/Gruppe.md", { x: -5, y: 5 }],
    ["wiki/Same.md", { x: 0.0001, y: 0 }],
  ]);
  const opened: string[] = [];
  const app = {
    workspace: { getActiveFile: () => active, openLinkText: (b: string) => void opened.push(b) },
    vault: { cachedRead: async () => "Inhalt" },
  };
  const container = new El("div");
  await renderActiveNoteFocus(app as never, container as never, { ...DEFAULT_SETTINGS, radarNoteCount: 4 }, undefined, () => true);
  const canvas = container.all().find((e) => e.tag === "canvas")!;
  const tooltip = container.all().find((e) => e.cls === "memvector-radar-tooltip")!;
  return { canvas, tooltip, opened, container, log: canvas.ctx!.log };
}

describe("renderActiveNoteFocus radar (#76)", () => {
  it("draws the radar with clamped scores and a fallback angle for coincident notes", async () => {
    const { log } = await render();
    expect(log).toMatchSnapshot();
  });

  it("zooms, drags, resets, shows tooltips and opens the clicked note", async () => {
    const { canvas, tooltip, opened, log } = await render();
    const steps: unknown[] = [];
    const mark = (label: string) => {
      steps.push({ label, log: log.splice(0), tooltip: { hidden: tooltip.hidden, text: tooltip.text, style: { ...tooltip.style } }, title: canvas.title, classes: canvas.classLog.splice(0), opened: [...opened] });
    };
    log.splice(0);
    canvas.listeners.wheel({ preventDefault() {}, clientX: 200, clientY: 100, deltaX: 0, deltaY: -50, ctrlKey: true });
    mark("zoom in");
    canvas.listeners.wheel({ preventDefault() {}, clientX: 0, clientY: 0, deltaX: 20, deltaY: 10, ctrlKey: false });
    mark("pan by wheel");
    canvas.onmousedown!({ clientX: 50, clientY: 50 });
    canvas.onmousemove!({ clientX: 80, clientY: 70 });
    canvas.onmouseup!({});
    mark("drag");
    canvas.onclick!({ clientX: 80, clientY: 70 });
    mark("click after drag is ignored");
    canvas.ondblclick!({});
    mark("reset");
    // Find a drawn dot from the last log (arc calls with the dot radius)
    const dots = (steps.at(-1) as { log: string[] }).log.filter((l) => /^arc\(/.test(l) && l.endsWith(",0,6.283)") && !l.includes(",2.5,"));
    const [x, y] = dots.at(-1)!.slice(4).split(",").map(Number);
    canvas.onmousemove!({ clientX: x + 15, clientY: y });
    mark("hover at 15px: tooltip (radius 16)");
    canvas.onmousedown!({ clientX: x + 15, clientY: y });
    canvas.onmouseup!({});
    canvas.onclick!({ clientX: x + 15, clientY: y });
    mark("click at 15px: nothing (radius 14)");
    canvas.onmousedown!({ clientX: x + 3, clientY: y });
    canvas.onmouseup!({});
    canvas.onclick!({ clientX: x + 3, clientY: y });
    mark("click on the dot opens it");
    canvas.onmouseleave!({});
    mark("leave hides the tooltip");
    expect(steps).toMatchSnapshot();
    expect(opened.length).toBe(1);
  });

  it("lists the first five neighbors with scores", async () => {
    const { container } = await render();
    const rows = container.all().filter((e) => e.cls === "memvector-radar-row").map((r) => r.children.map((c) => c.text));
    expect(rows).toMatchSnapshot();
  });
});
