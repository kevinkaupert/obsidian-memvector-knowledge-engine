import type { StoredNodePosition } from "../../sync/sqlite/nodePositions";
import { POSITION_WRITE_DELAY_MS, POSITION_WRITE_TOLERANCE } from "./layout/layoutTunables";
import { isPlaced, type ScatterNode } from "./types";

interface TimerHost {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(id: number): void;
}

export interface PositionPersisterOptions {
  /** Writes the given records; rejects when nothing was written. */
  write(records: StoredNodePosition[]): Promise<void>;
  /** The current nodes and whether writing is allowed (false after a failed position hydration). */
  source(): { nodes: ScatterNode[]; enabled: boolean };
  timers?: TimerHost;
}

/**
 * Purpose: Writes node positions to storage only when they moved, and batches the writes.
 * Architecture: Keeps the coordinates of the last successful write per node. A write sends only nodes that moved
 * beyond POSITION_WRITE_TOLERANCE relative to them, and that reference is updated afterwards to exactly the snapshot
 * that was written - never to positions that changed while the write was in flight. A failed write leaves the
 * reference untouched, so the same nodes still count as moved on the next write. Requests within
 * POSITION_WRITE_DELAY_MS are merged into one write; writes never overlap.
 */
export class PositionPersister {
  private persisted = new Map<string, { x: number; y: number }>();
  private timer: number | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly timers: TimerHost;

  constructor(private readonly options: PositionPersisterOptions) {
    this.timers = options.timers ?? window;
  }

  /** Records positions known to be in storage already (loaded from it), so they are not written back. */
  markPersisted(positions: Iterable<{ id: string; x: number; y: number }>): void {
    for (const p of positions) this.persisted.set(p.id, { x: p.x, y: p.y });
  }

  /** Requests a write after the quiet period. */
  schedule(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, POSITION_WRITE_DELAY_MS);
  }

  /** Writes moved positions now (e.g. when the view closes), after any write already in flight. */
  flush(): Promise<void> {
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
    const run = this.chain.then(() => this.writeMoved());
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Cancels a pending write without writing. */
  dispose(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Nodes whose position differs from the last successful write by more than the tolerance. */
  movedRecords(nodes: ScatterNode[]): StoredNodePosition[] {
    const records: StoredNodePosition[] = [];
    for (const n of nodes) {
      if (!isPlaced(n) || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
      const last = this.persisted.get(n.id);
      if (last && Math.hypot(n.x - last.x, n.y - last.y) <= POSITION_WRITE_TOLERANCE) continue;
      records.push({ id: n.id, path: n.path, x: n.x, y: n.y });
    }
    return records;
  }

  private async writeMoved(): Promise<void> {
    const { nodes, enabled } = this.options.source();
    if (!enabled) return;
    const snapshot = this.movedRecords(nodes);
    if (snapshot.length === 0) return;
    try {
      await this.options.write(snapshot);
      this.markPersisted(snapshot);
    } catch (err) {
      console.warn("MemVector: Failed to persist node positions, keeping them pending for the next write:", err);
    }
  }
}
