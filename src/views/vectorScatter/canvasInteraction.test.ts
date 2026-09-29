import { describe, expect, it, vi } from "vitest";
import { wireCanvasInteraction } from "./canvasInteraction";
import type { ScatterViewContext } from "./context";

vi.mock("obsidian", () => ({
  TFile: class {},
  Notice: class {},
}));

/** Records what a window is asked to schedule, cancel and listen for. */
function fakeWindow(name: string) {
  const listeners = new Map<string, Set<() => void>>();
  const scheduled: number[] = [];
  const cancelled: number[] = [];
  let nextHandle = 1;
  const win = {
    name,
    requestAnimationFrame: (_cb: FrameRequestCallback) => {
      const handle = nextHandle++;
      scheduled.push(handle);
      return handle;
    },
    cancelAnimationFrame: (handle: number) => {
      cancelled.push(handle);
    },
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
  };
  return {
    win: win as unknown as Window,
    scheduled,
    cancelled,
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

function fakeCanvas(win: Window) {
  let migrate: ((w: Window) => void) | null = null;
  const canvas = {
    win,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addClass: () => undefined,
    removeClass: () => undefined,
    onWindowMigrated: (listener: (w: Window) => void) => {
      migrate = listener;
      return () => {
        migrate = null;
      };
    },
  };
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    setWin: (w: Window) => {
      canvas.win = w;
    },
    migrateTo: (w: Window) => {
      canvas.win = w;
      migrate?.(w);
    },
    hasMigrationListener: () => migrate !== null,
  };
}

function wire(canvas: HTMLCanvasElement) {
  const ctx = {
    zoom: 1,
    pan: { x: 0, y: 0 },
    nodes: [],
    selectedNodeIds: new Set<string>(),
    isDraggingPan: false,
    isDraggingLasso: false,
    lassoSelectMode: false,
    redraw: vi.fn(),
    settings: { language: "en" },
  } as unknown as ScatterViewContext;

  const el = { addClass: () => undefined, removeClass: () => undefined, setText: () => undefined };
  const teardown = wireCanvasInteraction(ctx, {
    canvas,
    canvasWrap: el as unknown as HTMLElement,
    hoverBar: el as unknown as HTMLElement,
    updateSelectionUI: () => undefined,
  });
  return { ctx, teardown };
}

/** A wheel event is the cheapest way to reach the redraw throttle. */
const wheel = () =>
  ({ preventDefault: () => undefined, clientX: 10, clientY: 10, deltaX: 0, deltaY: 40, ctrlKey: false }) as unknown as WheelEvent;

describe("canvas interaction window binding", () => {
  it("schedules redraws on the canvas's window, not the plugin's global window", () => {
    const popout = fakeWindow("popout");
    const el = fakeCanvas(popout.win);
    let wheelHandler: ((e: WheelEvent) => void) | null = null;
    (el.canvas as unknown as { addEventListener: (t: string, f: unknown) => void }).addEventListener = (type, fn) => {
      if (type === "wheel") wheelHandler = fn as (e: WheelEvent) => void;
    };

    wire(el.canvas);
    wheelHandler!(wheel());

    expect(popout.scheduled).toHaveLength(1);
  });

  it("registers the window-level mouseup on the canvas's window", () => {
    const popout = fakeWindow("popout");
    const el = fakeCanvas(popout.win);

    const { teardown } = wire(el.canvas);
    expect(popout.listenerCount("mouseup")).toBe(1);

    teardown();
    expect(popout.listenerCount("mouseup")).toBe(0);
  });

  it("cancels a pending frame against the window that issued it", () => {
    const popout = fakeWindow("popout");
    const el = fakeCanvas(popout.win);
    let wheelHandler: ((e: WheelEvent) => void) | null = null;
    (el.canvas as unknown as { addEventListener: (t: string, f: unknown) => void }).addEventListener = (type, fn) => {
      if (type === "wheel") wheelHandler = fn as (e: WheelEvent) => void;
    };

    const { teardown } = wire(el.canvas);
    wheelHandler!(wheel());
    teardown();

    expect(popout.cancelled).toEqual(popout.scheduled);
  });

  it("follows the canvas when the view is moved to another window", () => {
    const first = fakeWindow("first");
    const second = fakeWindow("second");
    const el = fakeCanvas(first.win);
    let wheelHandler: ((e: WheelEvent) => void) | null = null;
    (el.canvas as unknown as { addEventListener: (t: string, f: unknown) => void }).addEventListener = (type, fn) => {
      if (type === "wheel") wheelHandler = fn as (e: WheelEvent) => void;
    };

    const { teardown } = wire(el.canvas);
    wheelHandler!(wheel());
    expect(first.scheduled).toHaveLength(1);

    el.migrateTo(second.win);

    // The frame pending on the window just left is cancelled there, and the
    // mouseup listener moves across instead of being left behind.
    expect(first.cancelled).toEqual(first.scheduled);
    expect(first.listenerCount("mouseup")).toBe(0);
    expect(second.listenerCount("mouseup")).toBe(1);

    wheelHandler!(wheel());
    expect(second.scheduled).toHaveLength(1);

    teardown();
    expect(second.listenerCount("mouseup")).toBe(0);
  });

  it("stops listening for migrations on teardown", () => {
    const popout = fakeWindow("popout");
    const el = fakeCanvas(popout.win);

    const { teardown } = wire(el.canvas);
    expect(el.hasMigrationListener()).toBe(true);

    teardown();
    expect(el.hasMigrationListener()).toBe(false);
  });
});
