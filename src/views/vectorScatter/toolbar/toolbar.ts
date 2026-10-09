import { Notice } from "obsidian";
import { getTranslation, type TranslationKeys } from "../../../i18n";
import { getShortModelName } from "../../../llm/getShortModelName";
import { EmbeddingTargetChangedError, resolveEmbeddingTarget } from "../../../sync/embeddingTarget";
import { EmbeddingAbortedError, VectorPersistenceError, runVectorPipeline, type VectorPipelineResult } from "../../../sync/vectorPipeline";
import { listIndexableFiles } from "../../../vaultFilter";
import { getVectorStore } from "../../../sync/storeFactory";
import { reconcileNodePositionsWithVault } from "../../../sync/sqlite/nodePositions";
import type { ScatterViewContext } from "../context";
import type { ScatterNode } from "../types";
import { contextWarnings, enrichContext } from "../contextEnrichment";
import { renderRetrievalWarning } from "../../../retrievalStatus";
import { CLOUD_SPACING_RANGE, NODE_SPACING_RANGE, clampCloudSpacing, clampNodeSpacing } from "../layout/layoutTunables";
import { buildPreviewEntries } from "../contextPreview";
import { createActionBtn, createDropdown, createIconButton, createSection, createSlider, createToggle, setActionBtnEnabled } from "./toolbarControls";

export interface ToolbarRefs {
  canvasWrap: HTMLElement;
  canvas: HTMLCanvasElement;
  toolbarEl: HTMLElement;
  hoverBar: HTMLElement;
}

export interface ToolbarHandles {
  statusText: HTMLElement;
  updateSelectionUI(): void;
  updateEdgeHops?(hops: number): void;
  updateFilterQuery?(query: string): void;
  /** Shows spacing values that changed outside this toolbar, without re-running the slider handlers. */
  updateSpacing?(nodeSpacing: number, cloudSpacing: number): void;
}

function setHoverBarText(hoverBar: HTMLElement, text: string, status?: "warning" | "error" | "muted"): void {
  hoverBar.removeClass("is-warning", "is-error", "is-muted");
  if (status) hoverBar.addClass(`is-${status}`);
  hoverBar.setText(text);
}

const UNLIMITED_HOPS = 999;

const EDGE_HOP_OPTIONS = (t: TranslationKeys): { id: string; label: string }[] => [
  { id: "0", label: t.edgeHopsAll },
  { id: "1", label: "1" },
  { id: "2", label: "2" },
  { id: "3", label: "3" },
  { id: String(UNLIMITED_HOPS), label: t.edgeHopsUnlimited },
];

const SYNTH_HOP_OPTIONS = (t: TranslationKeys): { id: string; label: string }[] => [
  { id: "1", label: `1 ${t.lblHopSingle}` },
  { id: "2", label: `2 ${t.lblHopPlural}` },
  { id: "3", label: `3 ${t.lblHopPlural}` },
];

export function buildToolbar(ctx: ScatterViewContext, refs: ToolbarRefs, t: TranslationKeys): ToolbarHandles {
  const { toolbarEl, hoverBar } = refs;

  const panelHeader = toolbarEl.createDiv({ cls: "memvector-toolbar-header" });
  const headerLeft = panelHeader.createDiv({ cls: "memvector-toolbar-header-left" });
  headerLeft.createDiv({ cls: "memvector-toolbar-header-dot" });
  const statusText = panelHeader.createSpan({ text: "–", cls: "memvector-toolbar-status" });
  let updateSelectionUI = (): void => {};

  // ── Quick Actions Bar (pinned top) ────────────────────────────────────
  const actionsBar = toolbarEl.createDiv({ cls: "memvector-toolbar-quick-actions" });

  createIconButton(actionsBar, "expand", t.btnFitView, () => {
    ctx.fitToView();
    ctx.redraw();
  });

  const embedModelLabel = resolveEmbeddingTarget(ctx.settings).model;
  const calcVectorsBtn = createIconButton(actionsBar, "sparkles", `${t.btnCalcVectors} (${embedModelLabel})`, () => {
    void runCalcVectors(ctx, calcVectorsBtn, statusText, hoverBar);
  });

  const createRelBtn = createIconButton(actionsBar, "link", `${t.btnCreateRel} (≥2)`, () => {
    const selected = ctx.nodes.filter((n) => ctx.selectedNodeIds.has(n.id));
    if (selected.length >= 2) ctx.openRelationBuilder(selected);
  });
  setActionBtnEnabled(createRelBtn, false);

  // ── Scrollable Body for all sections ──────────────────────────────────
  const scrollBody = toolbarEl.createDiv({ cls: "memvector-toolbar-scroll-body" });

  // ── Filter ────────────────────────────────────────────────────────────
  const filterBody = createSection(scrollBody, t.secFilter, true);

  const searchInput = filterBody.createEl("input", {
    type: "text",
    placeholder: t.searchPlaceholder,
    cls: "memvector-toolbar-input",
  });
  searchInput.onmousedown = (e) => e.stopPropagation();
  searchInput.onmouseup = (e) => e.stopPropagation();
  searchInput.onclick = (e) => e.stopPropagation();
  searchInput.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && searchInput.value.trim()) {
      ctx.searchNote(searchInput.value.trim());
    }
  };

  const filterInput = filterBody.createEl("input", {
    type: "text",
    placeholder: "-path:archiv tag:#mathe...",
    cls: "memvector-toolbar-input",
  });
  filterInput.value = ctx.viewFilterQuery || "";
  filterInput.onmousedown = (e) => e.stopPropagation();
  filterInput.onmouseup = (e) => e.stopPropagation();
  filterInput.onclick = (e) => e.stopPropagation();
  filterInput.onkeydown = (e) => e.stopPropagation();

  let filterDebounce: number | null = null;
  filterInput.oninput = () => {
    if (filterDebounce) window.clearTimeout(filterDebounce);
    filterDebounce = window.setTimeout(() => {
      void (async () => {
        const val = filterInput.value.trim();
        ctx.viewFilterQuery = val;
        await ctx.scanVaultNotes(val);
        updateSelectionUI();
        ctx.redraw();
      })();
    }, 250);
  };

  // ── Ansicht ───────────────────────────────────────────────────────────
  const ansichtBody = createSection(scrollBody, t.secView, true);

  ctx.nodeSpacing = clampNodeSpacing(ctx.nodeSpacing || ctx.settings.scatterNodeSpacing || 350);
  ctx.cloudSpacing = clampCloudSpacing(ctx.cloudSpacing || ctx.settings.scatterCloudSpacing || 800);

  const nodeSpacingSlider = createSlider(ansichtBody, t.lblNodeSpacing, NODE_SPACING_RANGE.min, NODE_SPACING_RANGE.max, NODE_SPACING_RANGE.step, ctx.nodeSpacing, (val) => `${Math.round(val / 40)}`, (newVal) => {
    void (async () => {
      ctx.nodeSpacing = newVal;
      ctx.settings.scatterNodeSpacing = newVal;
      await ctx.saveSettings();
      ctx.applyLayout();
      ctx.redraw();
      ctx.notifyOpenViews?.();
    })();
  });
  const cloudSpacingSlider = createSlider(ansichtBody, t.lblCloudSpacing, CLOUD_SPACING_RANGE.min, CLOUD_SPACING_RANGE.max, CLOUD_SPACING_RANGE.step, ctx.cloudSpacing, (val) => `${Math.round(val / 100)}`, (newVal) => {
    void (async () => {
      ctx.cloudSpacing = newVal;
      ctx.settings.scatterCloudSpacing = newVal;
      await ctx.saveSettings();
      ctx.applyLayout();
      ctx.redraw();
      ctx.notifyOpenViews?.();
    })();
  });
  // Data updates only adjust the layout locally (ADR-0006); a free global layout is this explicit action.
  createActionBtn(ansichtBody, t.btnRearrangeLayout, () => {
    void ctx.rearrangeLayout();
  });
  const edgeHopsSelect = createDropdown(ansichtBody, t.lblEdgeHops, EDGE_HOP_OPTIONS(t), String(ctx.edgeHops), (val) => {
    // 0 ("Alle") is a valid, meaningful value here - `parseInt(val, 10) || 1`
    // would silently coerce it back to 1 since 0 is falsy in JS.
    const parsed = parseInt(val, 10);
    const resolvedHops = Number.isNaN(parsed) ? 1 : parsed;
    ctx.edgeHops = resolvedHops;
    ctx.settings.scatterEdgeHops = resolvedHops;
    void ctx.saveSettings();
    ctx.redraw();
  });

  // ── Synthese ──────────────────────────────────────────────────────────
  const syntheseBody = createSection(scrollBody, t.secSynthesis, false);

  const promptInput = syntheseBody.createEl("textarea", {
    placeholder: t.synthPromptPlaceholder,
    cls: "memvector-toolbar-prompt-input",
  });
  promptInput.onmousedown = (e) => e.stopPropagation();
  promptInput.onmouseup = (e) => e.stopPropagation();
  promptInput.onclick = (e) => e.stopPropagation();
  promptInput.onkeydown = (e) => e.stopPropagation();

  let synthHopRow: HTMLElement | null = null;
  let synthSimRow: HTMLElement | null = null;
  let refreshContextPreview = (): void => {};

  createToggle(syntheseBody, t.synthEnrichToggle, ctx.settings.enrichSynthesisContext, (on) => {
    void (async () => {
      ctx.settings.enrichSynthesisContext = on;
      if (synthHopRow) synthHopRow.hidden = !on;
      if (synthSimRow) synthSimRow.hidden = !on;
      await ctx.saveSettings();
      refreshContextPreview();
    })();
  });

  const synthHopSelect = createDropdown(
    syntheseBody,
    t.lblSynthHopDepth,
    SYNTH_HOP_OPTIONS(t),
    String(ctx.settings.synthesisHopDepth ?? 2),
    (val) => {
      void (async () => {
        const parsed = parseInt(val, 10);
        ctx.settings.synthesisHopDepth = Number.isNaN(parsed) ? 2 : parsed;
        await ctx.saveSettings();
        refreshContextPreview();
      })();
    }
  );
  synthHopRow = synthHopSelect.parentElement;
  if (synthHopRow) synthHopRow.hidden = !ctx.settings.enrichSynthesisContext;

  const synthSimInput = createSlider(
    syntheseBody,
    t.minVectorSimTitle,
    0,
    1,
    0.05,
    ctx.settings.minVectorSimilarity ?? 0.75,
    (val) => val.toFixed(2),
    (newVal) => {
      void (async () => {
        ctx.settings.minVectorSimilarity = newVal;
        await ctx.saveSettings();
        refreshContextPreview();
      })();
    }
  );
  synthSimRow = synthSimInput.parentElement;
  if (synthSimRow) synthSimRow.hidden = !ctx.settings.enrichSynthesisContext;

  // ── Kontext-Vorschau (Issue #103) ─────────────────────────────────────
  // Shows which notes will be sent as enrichment context and why (hop
  // distance / similarity) - the same code path as the real synthesis, so
  // the preview is what actually gets sent. Selected seed notes are pinned
  // on top, visually separated from traversed notes (Issue #117). Traversed
  // notes can be dismissed for the current session; dismissed ids feed the
  // synthesis call too, so the payload matches the preview (Issue #116).
  const previewWrap = syntheseBody.createDiv({ cls: "memvector-context-preview-wrap" });
  const previewHeaderRow = previewWrap.createDiv({ cls: "memvector-context-preview-header" });
  const previewTitleEl = previewHeaderRow.createDiv({ cls: "memvector-context-preview-title", text: `${t.contextPreviewTitle} (0)` });
  const resetPreviewBtn = previewHeaderRow.createEl("button", { text: t.previewResetBtn, cls: "memvector-context-preview-reset" });
  resetPreviewBtn.hidden = true;
  const previewList = previewWrap.createEl("ul", { cls: "memvector-context-preview" });

  let previewTimer: number | null = null;
  /** Manually dismissed note ids for the current synthesis session - preserved across slider/threshold adjustments (Issue #116). */
  const dismissedContextIds = new Set<string>();

  const renderPreviewGroup = (label: string, entries: { id: string; title: string; kind: string; source: string; reason: string }[]): void => {
    const header = previewList.createEl("li", { cls: "memvector-context-preview-group" });
    header.setText(`${label} (${entries.length})`);
    for (const entry of entries) {
      const item = previewList.createEl("li", { cls: "memvector-context-preview-item" });
      item.createSpan({ text: entry.title, cls: "memvector-context-preview-name" });
      if (entry.kind === "seed") {
        item.createSpan({ text: `[${t.previewSeedBadge}]`, cls: "memvector-context-preview-badge memvector-badge-seed" });
      }
      const meta = [entry.source, entry.reason].filter(Boolean).join("  ");
      // Seeds carry no meta text; an empty span with an empty aria-label would just be
      // one more thing for a screen reader to announce.
      if (meta) item.createSpan({ text: meta, cls: "memvector-context-preview-meta", attr: { "aria-label": meta } });
      if (entry.kind !== "seed") {
        const dismissBtn = item.createEl("button", { text: "✕", cls: "memvector-context-preview-dismiss" });
        dismissBtn.title = t.previewDismissTitle;
        dismissBtn.onclick = () => {
          dismissedContextIds.add(entry.id);
          doRefreshPreview();
        };
      }
    }
  };

  const doRefreshPreview = (): void => {
    void (async () => {
      const selected = ctx.nodes.filter((n) => ctx.selectedNodeIds.has(n.id));
      if (!ctx.settings.enrichSynthesisContext || selected.length === 0) {
        previewWrap.hidden = true;
        return;
      }
      previewWrap.hidden = false;
      // Set before the fetch: on a failed enrichment the user still needs the reset
      // button to undo dismissals, otherwise the dismissed set becomes unreachable.
      resetPreviewBtn.hidden = dismissedContextIds.size === 0;
      previewList.empty();
      previewList.createEl("li", { cls: "memvector-context-preview-empty", text: "..." });
      try {
        const context = await enrichContext(ctx.app, ctx.settings, selected, 100, undefined, dismissedContextIds);
        previewList.empty();
        for (const message of contextWarnings(context, t)) {
          renderRetrievalWarning(previewList.createEl("li"), message);
        }
        // enrichContext already dropped the dismissed ids above, so what is shaped here
        // is exactly the note list the synthesis call will send.
        const { seeds, traversed, total } = buildPreviewEntries(context.notes, selected, { single: t.lblHopSingle, plural: t.lblHopPlural });
        previewTitleEl.setText(`${t.contextPreviewTitle} (${total})`);
        if (total === 0) {
          previewList.createEl("li", { cls: "memvector-context-preview-empty", text: t.previewEmpty });
          return;
        }
        if (seeds.length > 0) renderPreviewGroup(t.contextPreviewSelected, seeds);
        if (traversed.length > 0) renderPreviewGroup(t.contextPreviewTraversed, traversed);
      } catch {
        previewList.empty();
        renderRetrievalWarning(previewList.createEl("li"), t.retrievalContextFailed);
      }
    })();
  };

  resetPreviewBtn.onclick = () => {
    dismissedContextIds.clear();
    doRefreshPreview();
  };

  refreshContextPreview = (): void => {
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(doRefreshPreview, 400);
  };
  previewWrap.hidden = true;

  const fullModelName = ctx.settings.modelName || "LLM";
  const synthesizeBtn = createActionBtn(syntheseBody, `${getShortModelName(fullModelName)} ${t.secSynthesis} (0)`, null, true);
  synthesizeBtn.title = `${t.modelLabelPrefix}: ${fullModelName}`;
  setActionBtnEnabled(synthesizeBtn, false);
  synthesizeBtn.onclick = () => {
    void ctx.runSynthesis((text) => setHoverBarText(hoverBar, text), promptInput.value, dismissedContextIds);
  };

  const clearSelBtn = createActionBtn(syntheseBody, t.btnClearSel, () => {
    ctx.selectedNodeIds.clear();
    updateSelectionUI();
  });
  clearSelBtn.hidden = true;

  setHoverBarText(hoverBar, t.hoverHint);

  updateSelectionUI = () => {
    const count = ctx.selectedNodeIds.size;
    const rawModel = ctx.settings.modelName || "LLM";
    const shortModel = getShortModelName(rawModel);

    setActionBtnEnabled(synthesizeBtn, count > 0);
    synthesizeBtn.setText(`${shortModel} ${t.secSynthesis} (${count})`);
    synthesizeBtn.title = `${t.modelLabelPrefix}: ${rawModel}`;

    setActionBtnEnabled(createRelBtn, count >= 2);
    createRelBtn.title = count >= 2 ? `${t.btnCreateRel} (${count})` : `${t.btnCreateRel} (≥2)`;
    createRelBtn.setAttribute("aria-label", createRelBtn.title);

    setActionBtnEnabled(clearSelBtn, count > 0);
    clearSelBtn.hidden = count === 0;

    if (count > 0) {
      statusText.setText(`${ctx.nodes.length} | ${count} ${t.statusSelectedSuffix}`);
    } else if (ctx.nodes.length > 0) {
      const embeddedCount = ctx.nodes.filter((n) => n.embedding && n.embedding.length > 0).length;
      if (embeddedCount === ctx.nodes.length) {
        statusText.setText(`${ctx.nodes.length} | ${t.statusCacheActive}`);
      } else {
        const uncalc = ctx.nodes.length - embeddedCount;
        statusText.setText(`${ctx.nodes.length} | ${uncalc} ${t.statusUncalculated}`);
      }
    } else {
      statusText.setText("–");
    }
    refreshContextPreview();
    ctx.redraw();
  };

  return {
    statusText,
    updateSelectionUI,
    updateEdgeHops: (hops: number) => {
      edgeHopsSelect.value = String(hops);
    },
    updateFilterQuery: (query: string) => {
      if (filterDebounce !== null) window.clearTimeout(filterDebounce);
      filterInput.value = query;
    },
    updateSpacing: (nodeSpacing: number, cloudSpacing: number) => {
      // Display only: the change came from elsewhere, so the sliders' own handlers must not fire again.
      nodeSpacingSlider.setDisplayedValue(nodeSpacing);
      cloudSpacingSlider.setDisplayedValue(cloudSpacing);
    },
  };
}

/**
 * Purpose: Calculates embeddings for the scanned nodes, persists them to SQLite, and displays progress and error
 * feedback; the button is re-enabled whatever happens.
 * Architecture: Works on a snapshot of the node list. The live vault watcher replaces ctx.nodes while embedding
 * requests are awaited, so indexing into ctx.nodes per iteration could read past a shorter list or pair a vector with
 * a different note.
 */
async function runCalcVectors(ctx: ScatterViewContext, btn: HTMLButtonElement, statusText: HTMLElement, hoverBar: HTMLElement): Promise<void> {
  const vT = getTranslation(ctx.settings.language || "de");

  if (!ctx.nodes || ctx.nodes.length === 0) {
    await ctx.scanVaultNotes();
  }

  const workNodes = [...ctx.nodes];
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
    result = await runVectorPipeline(ctx.app, ctx.settings, getVectorStore(ctx.app, ctx.settings), {
      paths: workNodes.map((n) => n.path),
      // Reconcile against the whole indexable vault, not ctx.nodes: the node list honours the transient view
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

export { runCalcVectors };
