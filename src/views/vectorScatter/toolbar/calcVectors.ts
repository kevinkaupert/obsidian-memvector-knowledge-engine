/**
 * Purpose: "Calculate vectors" in the 2D view's toolbar: embeds the scanned notes through the shared vector pipeline,
 * hands the vectors to the view and reports progress and errors.
 * Architecture: Split out of toolbar.ts (#273); toolbar.ts re-exports runCalcVectors.
 */

import { Notice } from "obsidian";
import { getTranslation } from "../../../i18n";
import { EmbeddingTargetChangedError, resolveEmbeddingTarget } from "../../../sync/embeddingTarget";
import { EmbeddingAbortedError, VectorPersistenceError, runVectorPipeline, type VectorPipelineResult } from "../../../sync/vectorPipeline";
import { listIndexableFiles } from "../../../vaultFilter";
import { getVectorStore } from "../../../sync/storeFactory";
import { reconcileNodePositionsWithVault } from "../../../sync/sqlite/nodePositions";
import { migrateVaultNoteKeys } from "../../../sync/sqlite/noteKeyMigration";
import type { ScatterViewContext } from "../context";
import type { ScatterNode } from "../types";
import { setActionBtnEnabled } from "./toolbarControls";
import { setHoverBarText } from "./hoverBar";

/**
 * Purpose: Calculates embeddings for the scanned nodes, persists them to SQLite, and displays progress and error
 * feedback; the button is re-enabled whatever happens.
 * Architecture: Works on a snapshot of the node list. The live vault watcher replaces ctx.nodes while embedding
 * requests are awaited, so indexing into ctx.nodes per iteration could read past a shorter list or pair a vector with
 * a different note.
 */
export async function runCalcVectors(ctx: ScatterViewContext, btn: HTMLButtonElement, statusText: HTMLElement, hoverBar: HTMLElement): Promise<void> {
  const vT = getTranslation(ctx.settings.language || "de");

  if (!ctx.nodes || ctx.nodes.length === 0) {
    await ctx.scanVaultNotes();
  }

  // Only the notes the filter shows: filtered notes stay in the layout (Plan 0005 S2) but are not embedded on request.
  const workNodes = [...ctx.getVisibleNodes()];
  if (workNodes.length === 0) {
    setHoverBarText(hoverBar, `[WARN] ${vT.warnNoNotesForVectors}`, "warning");
    return;
  }

  setActionBtnEnabled(btn, false);
  try {
    await calcAndPersistVectors(ctx, workNodes, statusText, hoverBar);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("MemVector: Vector calculation aborted:", err);
    statusText.setText(vT.statusErrorCount);
    setHoverBarText(hoverBar, `[ERROR] ${vT.noticeEmbeddingError}: ${msg}`, "error");
    new Notice(`[ERROR] ${vT.noticeEmbeddingError}: ${msg}`, 8000);
  } finally {
    setActionBtnEnabled(btn, true);
  }
}

/**
 * Purpose: Embeds every node of the stable work list through the shared vector pipeline, hands the vectors to the
 * view and reports the outcome in the toolbar.
 * Architecture: The pipeline (vectorPipeline.ts) gives the same guarantees as "Index vault locally now": failed notes
 * are skipped and reported, repeated failures abort the run, and reconcile runs against the whole indexable vault,
 * not the filtered view. Vectors reach the view's nodes only after the pipeline verified that the embedding target
 * did not change mid-run; on a switch the view keeps what the switch rehydrated.
 */
async function calcAndPersistVectors(ctx: ScatterViewContext, workNodes: ScatterNode[], statusText: HTMLElement, hoverBar: HTMLElement): Promise<void> {
  const vT = getTranslation(ctx.settings.language || "de");
  const { model: embedModel } = resolveEmbeddingTarget(ctx.settings);
  const titles = new Map(workNodes.map((n) => [n.path, n.title]));
  statusText.setText(`${vT.statusVectorsCalculating} 0/${workNodes.length}...`);

  let result: VectorPipelineResult;
  try {
    await migrateVaultNoteKeys(ctx.app, ctx.settings.vectorSearchExclusions);
    result = await runVectorPipeline(ctx.app, ctx.settings, getVectorStore(ctx.app, ctx.settings), {
      paths: workNodes.map((n) => n.path),
      // Reconcile against the whole indexable vault, not the visible nodes: the work list honours the transient view
      // filter, and reconciling against it would delete the vectors of every note filtered out of the view.
      reconcilePaths: listIndexableFiles(ctx.app, ctx.settings.vectorSearchExclusions).map((f) => f.path),
      collectVectors: true,
      onProgress: (i, total, path) =>
        setHoverBarText(hoverBar, `[INFO] ${vT.statusCalcEmbeddings} '${embedModel}' (${i + 1}/${total}): ${titles.get(path) ?? path}...`, "muted"),
      onEmbeddingError: (i, total, _path, error) =>
        setHoverBarText(hoverBar, `[ERROR] ${vT.noticeEmbeddingError} (${i + 1}/${total}): ${error}`, "error"),
    });
  } catch (err) {
    if (err instanceof EmbeddingTargetChangedError) {
      console.warn(`MemVector: ${err.message}, discarding the run's vectors`);
      statusText.setText(vT.statusVectorsCancelled);
      setHoverBarText(hoverBar, `[WARN] ${vT.noticeEmbeddingTargetChanged}`, "warning");
      new Notice(`[WARN] ${vT.noticeEmbeddingTargetChanged}`, 8000);
      return;
    }
    if (err instanceof VectorPersistenceError) {
      adoptEmbeddings(ctx, err.partial.vectors);
      console.error("MemVector: Failed to persist calculated vectors to SQLite:", err.cause);
      statusText.setText(vT.statusPersistenceError);
      setHoverBarText(hoverBar, `[ERROR] ${vT.hoverPersistenceError}: ${err.message || vT.unknownError}`, "error");
      new Notice(`[ERROR] ${vT.noticePersistenceError}: ${err.message}`, 8000);
      return;
    }
    if (err instanceof EmbeddingAbortedError) {
      adoptEmbeddings(ctx, err.partial.vectors);
      const done = err.partial.total - err.partial.vanishedCount;
      const ok = err.partial.calculatedCount + err.partial.skippedCount;
      statusText.setText(`${vT.statusErrorCount} (${ok}/${done})`);
      new Notice(`[ERROR] ${err.message}`, 8000);
      return;
    }
    throw err;
  }

  adoptEmbeddings(ctx, result.vectors);
  await reconcilePositionsOrWarn(ctx);
  await ctx.onVectorsCalculated();

  // Notes that still exist - the base for every count reported below.
  const done = result.total - result.vanishedCount;
  const { calculatedCount, skippedCount, failedPaths } = result;
  if (failedPaths.length > 0) {
    console.warn("MemVector: Notes skipped because their embedding failed:", failedPaths);
    const message = `${calculatedCount + skippedCount}/${done} ${vT.noticeVectorsCalc} '${embedModel}'. ${failedPaths.length} ${vT.indexVaultNoticePartial}`;
    setHoverBarText(hoverBar, `[WARN] ${message}`, "warning");
    statusText.setText(`${calculatedCount + skippedCount}/${done} | ${vT.indexVaultPartial.replace(/^\[WARN\]\s*/, "")}`);
    new Notice(`[WARN] ${message}`, 8000);
  } else if (calculatedCount === 0 && skippedCount > 0) {
    setHoverBarText(hoverBar, `[OK] ${done}/${done} ${vT.statusSkippedCached}`, "muted");
    statusText.setText(`${done} | ${vT.statusCacheActive}`);
    new Notice(`[OK] ${done} ${vT.statusSkippedCached}`);
  } else if (skippedCount > 0) {
    setHoverBarText(hoverBar, `[OK] ${calculatedCount}/${done} ${vT.noticeVectorsCalc} '${embedModel}' (${skippedCount} ${vT.statusSkippedCached})`, "muted");
    statusText.setText(`${done} | ${vT.statusVectorsOk}`);
    new Notice(`[OK] ${calculatedCount} ${vT.noticeVectorsCalc} '${embedModel}' (${skippedCount} ${vT.statusSkippedCached})`);
  } else {
    setHoverBarText(hoverBar, `[OK] ${calculatedCount}/${done} ${vT.noticeVectorsCalc} '${embedModel}' ${vT.noticeVectorsCalcSuffix}`, "muted");
    statusText.setText(`${done} | ${vT.statusVectorsOk}`);
    new Notice(`[OK] ${calculatedCount} ${vT.noticeVectorsCalc} '${embedModel}' ${vT.noticeVectorsCalcSuffix}`);
  }
}

/** Removes stored positions of notes that left the indexable vault; a failure only leaves orphaned rows, so it is logged. */
async function reconcilePositionsOrWarn(ctx: ScatterViewContext): Promise<void> {
  try {
    await reconcileNodePositionsWithVault(ctx.app, ctx.settings.vectorSearchExclusions);
  } catch (err) {
    console.warn("MemVector: Failed to remove stored positions of deleted or excluded notes:", err);
  }
}

/** Hands the run's vectors to the view's current nodes, matched by path so node objects a rescan created also get them. */
function adoptEmbeddings(ctx: ScatterViewContext, byPath: Map<string, number[]>): void {
  for (const n of ctx.nodes) {
    const embedding = byPath.get(n.path);
    if (embedding) n.embedding = embedding;
  }
}
