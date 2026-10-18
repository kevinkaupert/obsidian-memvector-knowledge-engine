/**
 * Purpose: Loads stored vectors and 2D positions into the 2D view's nodes and keeps the two gates that protect the
 * map: layout and position writes stay frozen after a failed vector read (#191), position writes after a failed
 * position read (#184).
 * Architecture: Split out of VectorScatterView (#273). The flags live only here; the view's position writer reads them
 * at write time. A full read reopens a gate, an incremental read can only close the position gate.
 */

import { Notice, type App } from "obsidian";
import { getTranslation } from "../../i18n";
import type { MemVectorSettings } from "../../settings/types";
import { resolveEmbeddingTarget } from "../../sync/embeddingTarget";
import { getVectorStore } from "../../sync/storeFactory";
import { getStoredNodePositions } from "../../sync/sqlite/nodePositions";
import { isPlaced, placeNode, type ScatterNode } from "./types";

export interface NodeHydrationHost {
  app(): App;
  settings(): MemVectorSettings;
  /** Records positions read from storage, so the position writer does not write them back. */
  markPositionsPersisted(positions: { id: string; x: number; y: number }[]): void;
}

export class NodeHydration {
  /** A full position read succeeded; until then (and after a failed read) positions are not written. */
  positionsHydrated = false;
  /** The last vector read failed: layout and position writes are frozen until a complete read succeeds (#191). */
  embeddingHydrationFailed = false;
  /** Embedding fingerprint the in-memory node vectors were loaded for; null before the first complete read. */
  private embeddingsFingerprint: string | null = null;

  constructor(private readonly host: NodeHydrationHost) {}

  /**
   * Purpose: Loads each scanned node's embedding from the vector store, so a reopened/rescanned graph uses the existing
   * semantic index instead of recomputing it through a provider.
   * Architecture: The store is the source of truth - it holds vectors re-indexed from Settings or another view, and is
   * scoped to the active embedding model. When it cannot be read, the in-memory vectors of the previous scan
   * (`fallback`) are only used if they belong to the current embedding fingerprint, and layout and position writes
   * stay frozen until a complete read (`full`) succeeds again, so fallback data never rearranges or overwrites the
   * map. Returns false on a failed read.
   */
  async embeddings(nodes: ScatterNode[], fallback: Map<string, number[]>, full = false): Promise<boolean> {
    const fingerprint = resolveEmbeddingTarget(this.host.settings()).fingerprint;
    if (nodes.length === 0) {
      if (full) this.markEmbeddingsHydrated(fingerprint);
      return true;
    }
    let stored: Map<string, number[]>;
    try {
      const store = getVectorStore(this.host.app(), this.host.settings());
      stored = await store.getVectors([...nodes.map((n) => n.path), ...nodes.map((n) => n.id)]);
    } catch (err) {
      this.markEmbeddingHydrationFailed(err);
      // In-memory vectors only stand in when they belong to the current model; otherwise none are better than foreign ones.
      if (this.embeddingsFingerprint === fingerprint) {
        for (const n of nodes) {
          const v = fallback.get(n.path) ?? fallback.get(n.id);
          if (v) n.embedding = v;
        }
      }
      return false;
    }
    for (const n of nodes) {
      const v = stored.get(n.path) ?? stored.get(n.id);
      if (v) n.embedding = v;
    }
    if (full) this.markEmbeddingsHydrated(fingerprint);
    return true;
  }

  /** Records a failed vector read: the map is frozen and the user is told once per failure period (Issue #191). */
  private markEmbeddingHydrationFailed(err: unknown): void {
    console.error("MemVector: Failed to load stored vectors; keeping the 2D map unchanged until they can be read:", err);
    if (!this.embeddingHydrationFailed) {
      const t = getTranslation(this.host.settings().language || "de");
      new Notice(`[ERROR] ${t.noticeEmbeddingHydrationFailed}`, 8000);
    }
    this.embeddingHydrationFailed = true;
  }

  /** A complete, successful vector read: layout updates resume and the in-memory vectors belong to `fingerprint`. */
  private markEmbeddingsHydrated(fingerprint: string): void {
    this.embeddingHydrationFailed = false;
    this.embeddingsFingerprint = fingerprint;
  }

  /**
   * Purpose: Loads the persisted 2D coordinates of unplaced nodes from SQLite.
   * Architecture: Preserves the user's mental map across restarts (ADR-0006). Fails safe by gating position
   * persistence so transient read errors never overwrite stored coordinates (Issue #184). A full scan (`full`)
   * re-opens the gate on success; an incremental update for a few new notes can only close it.
   */
  async positions(nodes: ScatterNode[], full = false): Promise<void> {
    if (nodes.length === 0) {
      if (full) this.positionsHydrated = true;
      return;
    }
    try {
      const queryKeys = [...nodes.map((n) => n.path), ...nodes.map((n) => n.id)];
      const stored = await getStoredNodePositions(this.host.app(), queryKeys);
      const inStorage: { id: string; x: number; y: number }[] = [];
      nodes.forEach((n) => {
        const pos = stored.get(n.id) ?? stored.get(n.path);
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) inStorage.push({ id: n.id, x: pos.x, y: pos.y });
      });
      this.host.markPositionsPersisted(inStorage);
      nodes.forEach((n) => {
        if (!isPlaced(n)) {
          const pos = stored.get(n.id) ?? stored.get(n.path);
          if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) placeNode(n, pos.x, pos.y);
        }
      });
      if (full) this.positionsHydrated = true;
    } catch (err) {
      this.positionsHydrated = false;
      console.warn("MemVector: Failed to hydrate stored node positions, aborting position persistence to protect mental map:", err);
    }
  }
}
