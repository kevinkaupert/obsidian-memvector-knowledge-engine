import { Notice } from "obsidian";
import { getTranslation, type TranslationKeys } from "../../../i18n";
import { fetchEmbedding } from "../../../llm/fetchEmbedding";
import { getShortModelName } from "../../../llm/getShortModelName";
import { resolveEmbeddingApiKey } from "../../../settings/secrets";
import { getVectorStore } from "../../../sync/storeFactory";
import type { VectorPoint } from "../../../sync/vectorStore";
import type { MemVectorSettings } from "../../../settings/types";
import type { ScatterViewContext } from "../context";
import { enrichContext } from "../contextEnrichment";
import { buildPreviewEntries } from "../contextPreview";
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

const VISUAL_STYLE_OPTIONS: { id: MemVectorSettings["scatterVisualStyle"]; labelKey: keyof TranslationKeys; fallback: string }[] = [
  { id: "monochrome", labelKey: "styleMonochrome", fallback: "Monochrom" },
  { id: "muted", labelKey: "styleMuted", fallback: "Gedämpfte Typ-Farben" },
  { id: "ink", labelKey: "styleInk", fallback: "Tinte & Fokus-Glow" },
];

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

  createDropdown(
    ansichtBody,
    t.lblVisualStyle,
    VISUAL_STYLE_OPTIONS.map((s) => ({ id: s.id, label: t[s.labelKey] || s.fallback })),
    ctx.settings.scatterVisualStyle || "ink",
    (newStyle) => {
      void (async () => {
        ctx.settings.scatterVisualStyle = newStyle as MemVectorSettings["scatterVisualStyle"];
        await ctx.saveSettings();
        ctx.redraw();
      })();
    }
  );

  if (!ctx.nodeSpacing || ctx.nodeSpacing < 250) {
    ctx.nodeSpacing = ctx.settings.scatterNodeSpacing || 350;
  }
  if (!ctx.cloudSpacing || ctx.cloudSpacing < 500) {
    ctx.cloudSpacing = ctx.settings.scatterCloudSpacing || 800;
  }

  createSlider(ansichtBody, "Punkt-Abstand", 120, 1600, 20, ctx.nodeSpacing, (val) => `${Math.round(val / 40)}`, (newVal) => {
    void (async () => {
      ctx.nodeSpacing = newVal;
      ctx.settings.scatterNodeSpacing = newVal;
      await ctx.saveSettings();
      ctx.applyLayout();
      ctx.redraw();
    })();
  });
  createSlider(ansichtBody, "Wolken-Abstand", 300, 3000, 50, ctx.cloudSpacing, (val) => `${Math.round(val / 100)}`, (newVal) => {
    void (async () => {
      ctx.cloudSpacing = newVal;
      ctx.settings.scatterCloudSpacing = newVal;
      await ctx.saveSettings();
      ctx.applyLayout();
      ctx.redraw();
    })();
  });
  let edgeHopsRow: HTMLElement | null = null;
  createToggle(ansichtBody, t.lblShowEdges, ctx.showEdges, (on) => {
    void (async () => {
      ctx.showEdges = on;
      if (edgeHopsRow) edgeHopsRow.hidden = !on;
      if (on) await ctx.loadRelationEdges();
      ctx.redraw();
    })();
  });
  const edgeHopsSelect = createDropdown(ansichtBody, t.lblEdgeHops, EDGE_HOP_OPTIONS(t), String(ctx.edgeHops), (val) => {
    // 0 ("Alle") is a valid, meaningful value here - `parseInt(val, 10) || 1`
    // would silently coerce it back to 1 since 0 is falsy in JS.
    const parsed = parseInt(val, 10);
    ctx.edgeHops = Number.isNaN(parsed) ? 1 : parsed;
    ctx.redraw();
  });
  edgeHopsRow = edgeHopsSelect.parentElement;
  if (edgeHopsRow) edgeHopsRow.hidden = !ctx.showEdges;

  createToggle(ansichtBody, t.lblShowRelationNotes, ctx.showRelationNotes, (on) => {
    ctx.showRelationNotes = on;
    ctx.redraw();
  });

  createToggle(ansichtBody, t.lblLasso, ctx.lassoSelectMode, (on) => {
    ctx.lassoSelectMode = on;
    refs.canvas.toggleClass("is-crosshair", on);
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
  let refreshContextPreview = (): void => {};

  createToggle(syntheseBody, t.synthEnrichToggle, ctx.settings.enrichSynthesisContext, (on) => {
    void (async () => {
      ctx.settings.enrichSynthesisContext = on;
      if (synthHopRow) synthHopRow.hidden = !on;
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

  createToggle(syntheseBody, t.synthAgentsToggle, ctx.settings.includeAgentsGuidelines, (on) => {
    void (async () => {
      ctx.settings.includeAgentsGuidelines = on;
      await ctx.saveSettings();
    })();
  });

  // ── Kontext-Vorschau (Issue #103) ─────────────────────────────────────
  // Shows which notes will be sent as enrichment context and why (hop
  // distance / similarity) - the same code path as the real synthesis, so
  // the preview is what actually gets sent. Scrollable to stay on screen.
  const previewWrap = syntheseBody.createDiv({ cls: "memvector-context-preview-wrap" });
  previewWrap.createDiv({ cls: "memvector-context-preview-title", text: t.contextPreviewTitle });
  const previewList = previewWrap.createEl("ul", { cls: "memvector-context-preview" });

  let previewTimer: number | null = null;
  refreshContextPreview = (): void => {
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
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
          const enriched = await enrichContext(ctx.app, ctx.settings, selected, 100);
          previewList.empty();
          const entries = buildPreviewEntries(enriched);
          if (entries.length === 0) {
            previewList.createEl("li", { cls: "memvector-context-preview-empty", text: t.previewEmpty });
            return;
          }
          for (const entry of entries) {
            const item = previewList.createEl("li", { cls: "memvector-context-preview-item" });
            item.createSpan({ text: entry.title, cls: "memvector-context-preview-name" });
            const meta = [entry.source, entry.reason].filter(Boolean).join("  ");
            item.createSpan({ text: meta, cls: "memvector-context-preview-meta", attr: { "aria-label": meta } });
          }
        } catch {
          previewList.empty();
          previewList.createEl("li", { cls: "memvector-context-preview-empty", text: t.previewEmpty });
        }
      })();
    }, 400);
  };
  previewWrap.hidden = true;

  const fullModelName = ctx.settings.modelName || "LLM";
  const synthesizeBtn = createActionBtn(syntheseBody, `${getShortModelName(fullModelName)} ${t.secSynthesis} (0)`, null, true);
  synthesizeBtn.title = `LLM Model: ${fullModelName}`;
  setActionBtnEnabled(synthesizeBtn, false);
  synthesizeBtn.onclick = () => {
    void ctx.runSynthesis((text) => setHoverBarText(hoverBar, text), promptInput.value);
  };

  // ── Aktionen ──────────────────────────────────────────────────────────
  const aktionenBody = createSection(toolbarEl, t.secActions, true);

  const refreshBtn = createActionBtn(aktionenBody, t.btnScanVault, null);
  refreshBtn.onclick = () => {
    void (async () => {
      statusText.setText("Scanne Vault Notizen...");
      setHoverBarText(hoverBar, "Scanne Vault-Notizen...", "muted");
      await ctx.scanVaultNotes();
      statusText.setText(`${ctx.nodes.length}`);
      setHoverBarText(hoverBar, `${ctx.nodes.length} Notizen erfolgreich im Vault gescannt.`);
      ctx.redraw();
    })();
  };

  createActionBtn(aktionenBody, "Ganzansicht zentrieren", () => {
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
    synthesizeBtn.title = `Modell: ${rawModel}`;

    setActionBtnEnabled(createRelBtn, count >= 2);
    createRelBtn.setText(count >= 2 ? `${t.btnCreateRel} (${count})` : `${t.btnCreateRel} (≥2)`);

    setActionBtnEnabled(clearSelBtn, count > 0);
    statusText.setText(`${ctx.nodes.length} | ${count} gew.`);
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
    setHoverBarText(hoverBar, ctx.settings.language === "en" ? "[WARN] No notes found in vault to calculate vectors." : "[WARN] Keine Notizen im Vault zum Berechnen von Vektoren gefunden.", "warning");
    return;
  }

  setActionBtnEnabled(btn, false);
  statusText.setText(ctx.settings.language === "en" ? `Vectors 0/${total}...` : `Vektoren 0/${total}...`);

  let successCount = 0;
  let lastError: string | null = null;
  const points: VectorPoint[] = [];

  for (let i = 0; i < total; i++) {
    const node = ctx.nodes[i];
    setHoverBarText(hoverBar, `[INFO] ${ctx.settings.language === "en" ? "Calculating embeddings with" : "Berechne Embeddings mit"} '${embedModel}' (${i + 1}/${total}): ${node.title}...`, "muted");

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
        id: node.path,
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
