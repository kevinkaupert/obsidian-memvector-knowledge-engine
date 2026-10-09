import { TFile, type App } from "obsidian";
import type { GraphStore, TypedEdgeInput } from "../../sync/graphStore";
import { writeRelationFile } from "./relationFileWriter";

export interface PreviousRelation {
  path: string;
  srcId: string;
  tgtId: string;
  relType: string;
}

/**
 * Purpose: Saves one relation as a file plus a graph edge, as a unit.
 * Architecture: The previous relation is preserved until both its replacement file and graph edge are saved. If the
 * graph write fails, the file write is undone - a new file is trashed, an edited file gets its old content back - so a
 * failed relation leaves neither a dangling note nor a half-applied edit behind.
 */
export async function saveRelation(
  app: App,
  store: GraphStore,
  path: string,
  content: string,
  edge: TypedEdgeInput,
  previous?: PreviousRelation
): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(path);
  const originalContent = existing instanceof TFile ? await app.vault.read(existing) : null;
  await writeRelationFile(app, path, content, previous?.path);
  try {
    await store.upsertTypedEdges([edge]);
  } catch (err) {
    await undoRelationFileWrite(app, path, originalContent);
    throw err;
  }

  if (!previous) return;
  if (previous.srcId && previous.tgtId && previous.relType) {
    for (const [src, tgt] of [[previous.srcId, previous.tgtId], [previous.tgtId, previous.srcId]]) {
      // In-place edits and direction swaps can reuse an old key. Never delete the replacement.
      const isReplacement = previous.relType === edge.relType && (
        (src === edge.src.id && tgt === edge.tgt.id) ||
        (edge.bidirectional && src === edge.tgt.id && tgt === edge.src.id)
      );
      if (!isReplacement) await store.deleteEdge(src, tgt, previous.relType);
    }
  }

  if (path !== previous.path) {
    const oldFile = app.vault.getAbstractFileByPath(previous.path);
    if (oldFile instanceof TFile) await app.fileManager.trashFile(oldFile);
  }
}

/**
 * Purpose: Reverts a relation file write after its graph edge could not be saved.
 * Architecture: A failed revert is logged and does not replace the original error, which is the one the caller reports.
 */
async function undoRelationFileWrite(app: App, path: string, originalContent: string | null): Promise<void> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  try {
    if (originalContent === null) await app.fileManager.trashFile(file);
    else await app.vault.modify(file, originalContent);
  } catch (err) {
    console.error(`MemVector: Failed to revert relation file ${path} after a graph write error:`, err);
  }
}
