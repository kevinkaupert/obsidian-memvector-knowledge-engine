import { TFile, type App } from "obsidian";
import type { GraphStore, TypedEdgeInput } from "../../sync/graphStore";
import { writeRelationFile } from "./relationFileWriter";

export interface PreviousRelation {
  path: string;
  srcId: string;
  tgtId: string;
  relType: string;
}

/** Preserve the previous relation until both its replacement file and graph edge are saved. */
export async function saveRelation(
  app: App,
  store: GraphStore,
  path: string,
  content: string,
  edge: TypedEdgeInput,
  previous?: PreviousRelation
): Promise<void> {
  await writeRelationFile(app, path, content, previous?.path);
  await store.upsertTypedEdges([edge]);

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
