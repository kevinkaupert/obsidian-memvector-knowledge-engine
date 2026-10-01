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
  /**
   * Whether a note still belongs in storage at write time (exists and is not excluded from indexing). The node list
   * can be stale - e.g. a hidden view has not applied a delete yet - and writing it would bring back rows the position
   * cleanup removed.
   */
  isStorable?(record: StoredNodePosition): boolean;
  timers?: TimerHost;
}

/**
 * Purpose: Writes node positions to storage only when they moved, and batches the writes.
 * Architecture: Keeps the coordinates of the last successful write per node. A write sends only nodes that moved
 * beyond POSITION_WRITE_TOLERANCE relative to them, and that reference is updated afterwards to exactly the snapshot
 * that was written - never to positions that changed while the write was in flight. A failed write leaves the
 * reference untouched, so the same nodes still count as moved on the next write. Positions read back from storage
 * cannot clear that: sql.js applies the update in memory before the file write fails, so a later read returns the
 * unsaved coordinates. Requests within POSITION_WRITE_DELAY_MS are merged into one write; writes never overlap.
 */
export class PositionPersister {
  private persisted = new Map<string, { x: number; y: number }>();
  /** Nodes whose last write failed; only a successful write clears them. */
  private failed = new Set<string>();
  private timer: number | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly timers: TimerHost;

  constructor(private readonly options: PositionPersisterOptions) {
    this.timers = options.timers ?? window;
  }

  /**
   * Records positions read from storage, so they are not written back. Nodes with a failed write are skipped: what
   * storage returns for them may never have reached the disk.
   */
  markPersisted(positions: Iterable<{ id: string; x: number; y: number }>): void {
    for (const p of positions) {
      if (!this.failed.has(p.id)) this.persisted.set(p.id, { x: p.x, y: p.y });
    }
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
      const last = this.failed.has(n.id) ? undefined : this.persisted.get(n.id);
      if (last && Math.hypot(n.x - last.x, n.y - last.y) <= POSITION_WRITE_TOLERANCE) continue;
      records.push({ id: n.id, path: n.path, x: n.x, y: n.y });
    }
    return records;
  }

  private async writeMoved(): Promise<void> {
    const { nodes, enabled } = this.options.source();
    if (!enabled) return;
    const isStorable = this.options.isStorable;
    const snapshot = this.movedRecords(nodes).filter((r) => !isStorable || isStorable(r));
    if (snapshot.length === 0) return;
    try {
      await this.options.write(snapshot);
      for (const r of snapshot) {
        this.failed.delete(r.id);
        this.persisted.set(r.id, { x: r.x, y: r.y });
      }
    } catch (err) {
      for (const r of snapshot) this.failed.add(r.id);
      console.warn("MemVector: Failed to persist node positions, keeping them pending for the next write:", err);
    }
  }
}
