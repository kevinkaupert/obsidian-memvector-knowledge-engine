import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_CHANGE_DEBOUNCE_MS, RELATION_CHANGE_DEBOUNCE_MS, VaultEventQueue } from "./vaultEventQueue";

describe("VaultEventQueue (#210)", () => {
  let ready: ReturnType<typeof vi.fn<() => void>>;
  let queue: VaultEventQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    ready = vi.fn<() => void>();
    queue = new VaultEventQueue(ready, globalThis as unknown as Window);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst of changes to one note into one entry and one flush", () => {
    for (let i = 0; i < 5; i++) {
      queue.noteChanged("a.md");
      vi.advanceTimersByTime(NOTE_CHANGE_DEBOUNCE_MS - 100);
    }
    expect(ready).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(ready).toHaveBeenCalledTimes(1);
    expect([...queue.take().upserts]).toEqual(["a.md"]);
  });

  it("flushes relation changes after the shorter delay", () => {
    queue.relationsChanged();
    vi.advanceTimersByTime(RELATION_CHANGE_DEBOUNCE_MS);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(queue.take().relations).toBe(true);
  });

  it("keeps the latest state of a path: change then delete is a delete, delete then create is a read", () => {
    queue.noteChanged("a.md");
    queue.noteDeleted("a.md");
    queue.noteDeleted("b.md");
    queue.noteChanged("b.md");
    const taken = queue.take();
    expect([...taken.removals]).toEqual(["a.md"]);
    expect([...taken.upserts]).toEqual(["b.md"]);
  });

  it("records a rename as removal of the old path and a read of the new one, following chains to the origin", () => {
    queue.noteRenamed("a.md", "b.md");
    queue.noteRenamed("b.md", "c.md");
    const taken = queue.take();
    expect([...taken.upserts]).toEqual(["c.md"]);
    expect([...taken.removals].sort()).toEqual(["a.md", "b.md"]);
    expect(taken.renamedFrom.get("c.md")).toBe("a.md");
  });

  it("drops pending per-note changes when a full scan supersedes them", () => {
    queue.noteChanged("a.md");
    queue.supersededByFullScan();
    vi.advanceTimersByTime(NOTE_CHANGE_DEBOUNCE_MS * 2);
    expect(ready).not.toHaveBeenCalled();
    expect(queue.hasPending()).toBe(false);
  });

  it("does not flush after dispose", () => {
    queue.noteChanged("a.md");
    queue.dispose();
    vi.advanceTimersByTime(NOTE_CHANGE_DEBOUNCE_MS * 2);
    expect(ready).not.toHaveBeenCalled();
  });
});
