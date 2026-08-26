import type { App } from "obsidian";
import type { MemVectorSettings, PendingMemgraphRelation } from "../../settings/types";
import type { TypedEdgeInput } from "./cypherBuilder";
import { pushRelationEdges } from "./relationSync";

/** Queues relation edges that couldn't be pushed live (Memgraph unreachable at save time). */
export function enqueuePendingRelations(settings: MemVectorSettings, edges: TypedEdgeInput[]): void {
  const queuedAt = new Date().toISOString();
  const queued: PendingMemgraphRelation[] = edges.map((e) => ({ ...e, queuedAt }));
  settings.pendingMemgraphRelations = [...settings.pendingMemgraphRelations, ...queued];
}

/**
 * Retries every queued relation in one batch. Throws if Memgraph is still
 * unreachable (queue stays untouched so the caller can leave it for next
 * time) - only clears/persists the queue on success.
 */
export async function flushPendingMemgraphRelations(
  app: App,
  settings: MemVectorSettings,
  saveSettings: () => Promise<void>
): Promise<number> {
  const pending = settings.pendingMemgraphRelations;
  if (pending.length === 0) return 0;

  await pushRelationEdges(app, settings, pending);
  const flushedCount = pending.length;
  settings.pendingMemgraphRelations = [];
  await saveSettings();
  return flushedCount;
}
