import { Notice } from "obsidian";
import { getTranslation, type TranslationKeys } from "../../../i18n";
import { fetchEmbedding } from "../../../llm/fetchEmbedding";
import { getShortModelName } from "../../../llm/getShortModelName";
import { resolveEmbeddingApiKey } from "../../../settings/secrets";
import { pathToId } from "../../../noteSlug";
import { getVectorStore } from "../../../sync/storeFactory";
import type { VectorPoint } from "../../../sync/vectorStore";
import type { ScatterViewContext } from "../context";
import { enrichContext } from "../contextEnrichment";
import { buildPreviewEntries, withoutDismissed } from "../contextPreview";
import { createActionBtn, createDropdown, createSection, createSlider, createToggle, setActionBtnEnabled } from "./toolbarControls";

export interface ToolbarRefs {
  canvasWrap: HTMLElement;
  canvas: HTMLCanvasElement;
  toolbarEl: HTMLElement;
  hoverBar: HTMLElement;
}

export interface ToolbarHandles {
  statusText: HTMLElement;
  updateSelectionUI(): void;
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

export function buildToolbar(ctx: ScatterViewContext, refs: ToolbarRefs, t: TranslationKeys): ToolbarHandles {
  const { toolbarEl, hoverBar } = refs;

  const panelHeader = toolbarEl.createDiv({ cls: "memvector-toolbar-header" });
  const headerLeft = panelHeader.createDiv({ cls: "memvector-toolbar-header-left" });
  headerLeft.createDiv({ cls: "memvector-toolbar-header-dot" });
  const statusText = panelHeader.createSpan({ text: "–", cls: "memvector-toolbar-status" });

  // ── Filter ────────────────────────────────────────────────────────────
  const filterBody = createSection(toolbarEl, t.secFilter, true);

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
        statusText.setText(`${ctx.nodes.length}`);
        ctx.redraw();
      })();
    }, 250);
  };

  // ── Ansicht ───────────────────────────────────────────────────────────
  const ansichtBody = createSection(toolbarEl, t.secView, true);

  if (!ctx.nodeSpacing || ctx.nodeSpacing < 250) {
    ctx.nodeSpacing = ctx.settings.scatterNodeSpacing || 350;
  }
  if (!ctx.cloudSpacing || ctx.cloudSpacing < 500) {
    ctx.cloudSpacing = ctx.settings.scatterCloudSpacing || 800;
  }

  createSlider(ansichtBody, t.lblNodeSpacing, 120, 1600, 20, ctx.nodeSpacing, (val) => `${Math.round(val / 40)}`, (newVal) => {
    void (async () => {
      ctx.nodeSpacing = newVal;
      ctx.settings.scatterNodeSpacing = newVal;
      await ctx.saveSettings();
      ctx.applyLayout();
      ctx.redraw();
    })();
  });
  createSlider(ansichtBody, t.lblCloudSpacing, 300, 3000, 50, ctx.cloudSpacing, (val) => `${Math.round(val / 100)}`, (newVal) => {
    void (async () => {
      ctx.cloudSpacing = newVal;
      ctx.settings.scatterCloudSpacing = newVal;
      await ctx.saveSettings();
      ctx.applyLayout();
      ctx.redraw();
    })();
  });
  createDropdown(ansichtBody, t.lblEdgeHops, EDGE_HOP_OPTIONS(t), String(ctx.edgeHops), (val) => {
    // 0 ("Alle") is a valid, meaningful value here - `parseInt(val, 10) || 1`
    // would silently coerce it back to 1 since 0 is falsy in JS.
    const parsed = parseInt(val, 10);
    ctx.edgeHops = Number.isNaN(parsed) ? 1 : parsed;
    ctx.redraw();
  });

  // ── Synthese ──────────────────────────────────────────────────────────
  const syntheseBody = createSection(toolbarEl, t.secSynthesis, false);

  const promptInput = syntheseBody.createEl("textarea", {
    placeholder: t.synthPromptPlaceholder,
    cls: "memvector-toolbar-prompt-input",
  });
  promptInput.onmousedown = (e) => e.stopPropagation();
  promptInput.onmouseup = (e) => e.stopPropagation();
  promptInput.onclick = (e) => e.stopPropagation();
  promptInput.onkeydown = (e) => e.stopPropagation();

  const synthHopOptions = [
    { id: "1", label: "1 Hop" },
    { id: "2", label: "2 Hops" },
    { id: "3", label: "3 Hops" },
  ];
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
    synthHopOptions,
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
      } else {
        const dismissBtn = item.createEl("button", { text: "✕", cls: "memvector-context-preview-dismiss" });
        dismissBtn.title = t.previewDismissTitle;
        dismissBtn.onclick = () => {
          dismissedContextIds.add(entry.id);
          doRefreshPreview();
        };
      }
      const meta = [entry.source, entry.reason].filter(Boolean).join("  ");
      item.createSpan({ text: meta, cls: "memvector-context-preview-meta", attr: { "aria-label": meta } });
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
      previewList.empty();
      previewList.createEl("li", { cls: "memvector-context-preview-empty", text: "..." });
      try {
        const enriched = await enrichContext(ctx.app, ctx.settings, selected, 100, undefined, dismissedContextIds);
        previewList.empty();
        const { seeds, traversed, total } = withoutDismissed(buildPreviewEntries(enriched, selected), dismissedContextIds);
        previewTitleEl.setText(`${t.contextPreviewTitle} (${total})`);
        resetPreviewBtn.hidden = dismissedContextIds.size === 0;
        if (total === 0) {
          previewList.createEl("li", { cls: "memvector-context-preview-empty", text: t.previewEmpty });
          return;
        }
        if (seeds.length > 0) renderPreviewGroup(t.contextPreviewSelected, seeds);
        if (traversed.length > 0) renderPreviewGroup(t.contextPreviewTraversed, traversed);
      } catch {
        previewList.empty();
        previewList.createEl("li", { cls: "memvector-context-preview-empty", text: t.previewEmpty });
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
  synthesizeBtn.title = `LLM Model: ${fullModelName}`;
  setActionBtnEnabled(synthesizeBtn, false);
  synthesizeBtn.onclick = () => {
    void ctx.runSynthesis((text) => setHoverBarText(hoverBar, text), promptInput.value, dismissedContextIds);
  };

  // ── Aktionen ──────────────────────────────────────────────────────────
  const aktionenBody = createSection(toolbarEl, t.secActions, true);

  const refreshBtn = createActionBtn(aktionenBody, t.btnScanVault, null);
  refreshBtn.onclick = () => {
    void (async () => {
      statusText.setText(t.statusScanningVault);
      setHoverBarText(hoverBar, t.statusScanningVault, "muted");
      await ctx.scanVaultNotes();
      statusText.setText(`${ctx.nodes.length}`);
      setHoverBarText(hoverBar, `${ctx.nodes.length} ${t.statusNotesScanned}`);
      ctx.redraw();
    })();
  };

  createActionBtn(aktionenBody, t.btnFitView, () => {
    ctx.fitToView();
    ctx.redraw();
  });

  const embedModelLabel = ctx.settings.embeddingModel || "bge-m3";
  const calcVectorsBtn = createActionBtn(aktionenBody, t.btnCalcVectors, null);
  calcVectorsBtn.title = `Embedding Model: ${embedModelLabel}`;
  calcVectorsBtn.onclick = () => {
    void runCalcVectors(ctx, calcVectorsBtn, statusText, hoverBar);
  };

  const createRelBtn = createActionBtn(aktionenBody, `${t.btnCreateRel} (≥2)`, null);
  setActionBtnEnabled(createRelBtn, false);
  createRelBtn.onclick = () => {
    const selected = ctx.nodes.filter((n) => ctx.selectedNodeIds.has(n.id));
    if (selected.length >= 2) ctx.openRelationBuilder(selected);
  };

  const clearSelBtn = createActionBtn(aktionenBody, t.btnClearSel, () => {
    ctx.selectedNodeIds.clear();
    updateSelectionUI();
  });

  setHoverBarText(hoverBar, t.hoverHint);

  const updateSelectionUI = () => {
    const count = ctx.selectedNodeIds.size;
    const rawModel = ctx.settings.modelName || "LLM";
    const shortModel = getShortModelName(rawModel);

    setActionBtnEnabled(synthesizeBtn, count > 0);
    synthesizeBtn.setText(`${shortModel} ${t.secSynthesis} (${count})`);
    synthesizeBtn.title = `${t.modelLabelPrefix}: ${rawModel}`;

    setActionBtnEnabled(createRelBtn, count >= 2);
    createRelBtn.setText(count >= 2 ? `${t.btnCreateRel} (${count})` : `${t.btnCreateRel} (≥2)`);

    setActionBtnEnabled(clearSelBtn, count > 0);
    statusText.setText(`${ctx.nodes.length} | ${count} ${t.statusSelectedSuffix}`);
    refreshContextPreview();
    ctx.redraw();
  };

  return { statusText, updateSelectionUI };
}

/**
 * Purpose: Iteratively calculates embeddings for scanned nodes, persists them to SQLite, and displays progress and error feedback.
 */
async function runCalcVectors(ctx: ScatterViewContext, btn: HTMLButtonElement, statusText: HTMLElement, hoverBar: HTMLElement): Promise<void> {
  const vT = getTranslation(ctx.settings.language || "de");
  const embedModel = ctx.settings.embeddingModel || "bge-m3";
  const apiBase = ctx.settings.embeddingApiBaseUrl || "http://localhost:11434/v1";
  const apiKey = resolveEmbeddingApiKey(ctx.app, ctx.settings);

  if (!ctx.nodes || ctx.nodes.length === 0) {
    await ctx.scanVaultNotes();
  }

  const total = ctx.nodes.length;
  if (total === 0) {
    setHoverBarText(hoverBar, `[WARN] ${vT.warnNoNotesForVectors}`, "warning");
    return;
  }

  setActionBtnEnabled(btn, false);
  statusText.setText(`${vT.statusVectorsCalculating} 0/${total}...`);

  let successCount = 0;
  let lastError: string | null = null;
  const points: VectorPoint[] = [];

  for (let i = 0; i < total; i++) {
    const node = ctx.nodes[i];
    setHoverBarText(hoverBar, `[INFO] ${vT.statusCalcEmbeddings} '${embedModel}' (${i + 1}/${total}): ${node.title}...`, "muted");

    const sampleText = `${node.title}\n${node.content}`.slice(0, 2000);
    const res = await fetchEmbedding(sampleText, apiBase, apiKey, embedModel);

    if (res.error) {
      lastError = res.error;
      setHoverBarText(hoverBar, `[ERROR] ${vT.noticeEmbeddingError} (${i + 1}/${total}): ${res.error}`, "error");
      new Notice(`[ERROR] ${vT.noticeEmbeddingError}: ${res.error}`, 8000);
      break;
    } else if (res.embedding) {
      node.embedding = res.embedding;
      points.push({
        id: pathToId(node.path),
        vector: res.embedding,
        payload: { path: node.path, title: node.title, content: node.content.slice(0, 500) },
      });
      successCount++;
    }
  }

  let syncFailed = false;
  let syncErrorMsg: string | null = null;

  if (points.length > 0) {
    try {
      const vectorStore = getVectorStore(ctx.app, ctx.settings);
      await vectorStore.syncPoints(points);
      // Only reconcile when every currently-scanned node was actually attempted -
      // the loop above breaks on the first embedding error, so a partial `points`
      // list here must never be read as "this is now the complete vault".
      if (successCount === total) await vectorStore.reconcile(ctx.nodes.map((n) => n.path));
    } catch (syncErr) {
      syncFailed = true;
      syncErrorMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
      console.error("MemVector: Failed to persist calculated vectors to SQLite:", syncErr);
    }
  }

  setActionBtnEnabled(btn, true);

  if (syncFailed) {
    statusText.setText(vT.statusPersistenceError);
    setHoverBarText(hoverBar, `[ERROR] ${vT.hoverPersistenceError}: ${syncErrorMsg || vT.unknownError}`, "error");
    new Notice(`[ERROR] ${vT.noticePersistenceError}: ${syncErrorMsg}`, 8000);
  } else if (successCount === total) {
    ctx.applyLayout();
    ctx.redraw();
    setHoverBarText(hoverBar, `[OK] ${successCount}/${total} ${vT.noticeVectorsCalc} '${embedModel}' ${vT.noticeVectorsCalcSuffix}`, "muted");
    statusText.setText(`${total} | ${vT.statusVectorsOk}`);
    new Notice(`[OK] ${successCount} ${vT.noticeVectorsCalc} '${embedModel}' ${vT.noticeVectorsCalcSuffix}`);
  } else if (lastError) {
    statusText.setText(`${vT.statusErrorCount} (${successCount}/${total})`);
  }
}

export { runCalcVectors };
