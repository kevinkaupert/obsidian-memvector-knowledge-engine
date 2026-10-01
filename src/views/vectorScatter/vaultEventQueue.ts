/** Debounce for note changes: Obsidian autosaves about every 2 s while typing. */
export const NOTE_CHANGE_DEBOUNCE_MS = 800;
/** Debounce for relation-note and vocabulary changes, which only reload edges. */
export const RELATION_CHANGE_DEBOUNCE_MS = 400;

/** One note-level vault event, as the watcher reports it. */
export type VaultNoteChange = { kind: "upsert"; path: string } | { kind: "delete"; path: string } | { kind: "rename"; path: string; oldPath: string };

/** Vault changes collected since the last flush, coalesced per path. */
export interface PendingVaultChanges {
  /** Notes to (re-)read: created, modified, or the new path of a rename. */
  upserts: Set<string>;
  /** Notes to drop: deleted, or the old path of a rename. */
  removals: Set<string>;
  /** New path -> original path of renamed notes, so the node keeps its position and vector. */
  renamedFrom: Map<string, string>;
  /** Relation notes or the vocabulary changed: edges and per-type forces must be reloaded. */
  relations: boolean;
  /** Something requested a full rescan, which supersedes the per-note changes. */
  fullScan: boolean;
}

interface TimerHost {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(id: number): void;
}

const emptyChanges = (): PendingVaultChanges => ({ upserts: new Set(), removals: new Set(), renamedFrom: new Map(), relations: false, fullScan: false });

/**
 * Purpose: Collects vault events for one scatter view and hands them over in batches after a quiet period.
 * Architecture: One queue replaces separate debounced rescans. Several events for the same file collapse into one
 * entry (latest state wins), and a rename is recorded as removal of the old path plus a read of the new one. Note
 * changes wait NOTE_CHANGE_DEBOUNCE_MS, relation changes RELATION_CHANGE_DEBOUNCE_MS; whichever fires first flushes
 * everything pending. The flush callback decides when to take the batch (e.g. not while the view is hidden).
 */
export class VaultEventQueue {
  private pending = emptyChanges();
  private noteTimer: number | null = null;
  private relationTimer: number | null = null;

  constructor(
    private readonly onReady: () => void,
    private readonly timers: TimerHost = window
  ) {}

  noteChanged(path: string): void {
    this.pending.removals.delete(path);
    this.pending.upserts.add(path);
    this.schedule("note");
  }

  noteDeleted(path: string): void {
    this.pending.upserts.delete(path);
    this.pending.renamedFrom.delete(path);
    this.pending.removals.add(path);
    this.schedule("note");
  }

  noteRenamed(oldPath: string, newPath: string): void {
    const origin = this.pending.renamedFrom.get(oldPath) ?? oldPath;
    this.pending.upserts.delete(oldPath);
    this.pending.renamedFrom.delete(oldPath);
    this.pending.removals.add(oldPath);
    this.pending.removals.delete(newPath);
    this.pending.upserts.add(newPath);
    if (origin !== newPath) this.pending.renamedFrom.set(newPath, origin);
    this.schedule("note");
  }

  relationsChanged(): void {
    this.pending.relations = true;
    this.schedule("relation");
  }

  /** A background full rescan, debounced like a note change. */
  fullScanRequested(): void {
    this.pending.fullScan = true;
    this.schedule("note");
  }

  /** Drops pending per-note changes because a full scan that reads every note is about to run. */
  supersededByFullScan(): void {
    this.pending = emptyChanges();
    this.clearTimers();
  }

  hasPending(): boolean {
    const p = this.pending;
    return p.fullScan || p.relations || p.upserts.size > 0 || p.removals.size > 0;
  }

  /** Hands over everything pending and starts a new batch. */
  take(): PendingVaultChanges {
    const taken = this.pending;
    this.pending = emptyChanges();
    this.clearTimers();
    return taken;
  }

  dispose(): void {
    this.clearTimers();
    this.pending = emptyChanges();
  }

  private schedule(kind: "note" | "relation"): void {
    if (kind === "note") {
      if (this.noteTimer !== null) this.timers.clearTimeout(this.noteTimer);
      this.noteTimer = this.timers.setTimeout(() => this.fire(), NOTE_CHANGE_DEBOUNCE_MS);
    } else {
      if (this.relationTimer !== null) this.timers.clearTimeout(this.relationTimer);
      this.relationTimer = this.timers.setTimeout(() => this.fire(), RELATION_CHANGE_DEBOUNCE_MS);
    }
  }

  private fire(): void {
    this.clearTimers();
    if (this.hasPending()) this.onReady();
  }

  private clearTimers(): void {
    if (this.noteTimer !== null) this.timers.clearTimeout(this.noteTimer);
    if (this.relationTimer !== null) this.timers.clearTimeout(this.relationTimer);
    this.noteTimer = null;
    this.relationTimer = null;
  }
}
