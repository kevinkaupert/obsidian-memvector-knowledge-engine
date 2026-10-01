import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredNodePosition } from "../../sync/sqlite/nodePositions";
import { PositionPersister } from "./positionPersistence";
import { POSITION_WRITE_DELAY_MS, POSITION_WRITE_TOLERANCE } from "./layout/layoutTunables";
import type { ScatterNode } from "./types";

const node = (id: string, x: number, y: number): ScatterNode => ({ id, basenameKey: id, title: id, type: "concept", path: `${id}.md`, x, y, latexFormulas: [], links: [], content: "" });

describe("PositionPersister (#211)", () => {
  let nodes: ScatterNode[];
  let enabled: boolean;
  let write: ReturnType<typeof vi.fn<(records: StoredNodePosition[]) => Promise<void>>>;
  let persister: PositionPersister;

  beforeEach(() => {
    vi.useFakeTimers();
    nodes = [node("a", 10, 10), node("b", 20, 20), node("c", 30, 30)];
    enabled = true;
    write = vi.fn<(records: StoredNodePosition[]) => Promise<void>>(async () => {});
    persister = new PositionPersister({ write, source: () => ({ nodes, enabled }), timers: globalThis as unknown as Window });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const writtenIds = (call = 0) => write.mock.calls[call][0].map((r) => r.id);

  it("writes nothing when no node moved since the positions were loaded", async () => {
    persister.markPersisted(nodes);
    await persister.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("writes only the nodes that moved beyond the tolerance", async () => {
    persister.markPersisted(nodes);
    nodes[0].x += POSITION_WRITE_TOLERANCE / 2;
    nodes[1].x += POSITION_WRITE_TOLERANCE * 4;
    await persister.flush();
    expect(writtenIds()).toEqual(["b"]);
  });

  it("writes new and unknown nodes but never unplaced ones", async () => {
    nodes.push(node("unplaced", 0, 0));
    await persister.flush();
    expect(writtenIds()).toEqual(["a", "b", "c"]);
  });

  it("writes a node placed at exactly the origin (#190)", async () => {
    nodes = [{ ...node("origin", 0, 0), placed: true }];
    await persister.flush();
    expect(writtenIds()).toEqual(["origin"]);
  });

  it("merges a burst of requests into one write", async () => {
    for (let i = 0; i < 5; i++) {
      nodes[0].x += 10;
      persister.schedule();
      await vi.advanceTimersByTimeAsync(POSITION_WRITE_DELAY_MS / 2);
    }
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(POSITION_WRITE_DELAY_MS);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("keeps the changes pending after a failed write and sends the full moved set next time", async () => {
    persister.markPersisted(nodes);
    nodes[0].x += 5;
    nodes[1].x += 5;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    write.mockRejectedValueOnce(new Error("disk full"));
    await persister.flush();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    await persister.flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(writtenIds(1)).toEqual(["a", "b"]);
    await persister.flush();
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed write pending even when storage later returns the unsaved coordinates", async () => {
    persister.markPersisted(nodes);
    nodes[0].x += 5;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    write.mockRejectedValueOnce(new Error("disk full"));
    await persister.flush();
    warn.mockRestore();

    // sql.js already holds the new coordinates in memory, so a rescan reads them back.
    persister.markPersisted([{ id: "a", x: nodes[0].x, y: nodes[0].y }]);
    await persister.flush();

    expect(write).toHaveBeenCalledTimes(2);
    expect(writtenIds(1)).toEqual(["a"]);
    persister.markPersisted([{ id: "a", x: nodes[0].x, y: nodes[0].y }]);
    await persister.flush();
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("uses the written snapshot as reference, not positions that changed while writing", async () => {
    persister.markPersisted(nodes);
    nodes[0].x += 5;
    let release!: () => void;
    write.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const inFlight = persister.flush();
    await Promise.resolve();
    nodes[0].x += 5;
    release();
    await inFlight;

    await persister.flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0][0]).toMatchObject({ id: "a", x: 20 });
  });

  it("skips nodes that no longer belong in storage at write time (#196)", async () => {
    persister = new PositionPersister({ write, source: () => ({ nodes, enabled }), isStorable: (r) => r.id !== "b", timers: globalThis as unknown as Window });
    await persister.flush();
    expect(writtenIds()).toEqual(["a", "c"]);
  });

  it("writes nothing while disabled (failed position hydration)", async () => {
    enabled = false;
    await persister.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("drops a scheduled write on dispose", async () => {
    persister.schedule();
    persister.dispose();
    await vi.advanceTimersByTimeAsync(POSITION_WRITE_DELAY_MS * 2);
    expect(write).not.toHaveBeenCalled();
  });
});
