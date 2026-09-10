import { Notice } from "obsidian";
import { getTranslation, type TranslationKeys } from "../../../i18n";
import { fetchEmbedding } from "../../../llm/fetchEmbedding";
import { getShortModelName } from "../../../llm/getShortModelName";
import { getEmbeddingApiKey } from "../../../settings/secrets";
import { getVectorStore } from "../../../sync/storeFactory";
import type { VectorPoint } from "../../../sync/vectorStore";
import type { MemVectorSettings } from "../../../settings/types";
import type { ScatterViewContext } from "../context";
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
    placeholder: "-path:schema -file:index...",
    cls: "memvector-toolbar-input",
  });
  filterInput.value = ctx.settings.vectorSearchExclusions || "";
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
        ctx.settings.vectorSearchExclusions = val;
        await ctx.saveSettings();
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

  createToggle(syntheseBody, t.synthEnrichToggle, ctx.settings.enrichSynthesisContext, (on) => {
    void (async () => {
      ctx.settings.enrichSynthesisContext = on;
      await ctx.saveSettings();
    })();
  });

  createToggle(syntheseBody, t.synthAgentsToggle, ctx.settings.includeAgentsGuidelines, (on) => {
    void (async () => {
      ctx.settings.includeAgentsGuidelines = on;
      await ctx.saveSettings();
    })();
  });

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
    ctx.redraw();
  };

  return { statusText, updateSelectionUI };
}

async function runCalcVectors(ctx: ScatterViewContext, btn: HTMLButtonElement, statusText: HTMLElement, hoverBar: HTMLElement): Promise<void> {
  const embedModel = ctx.settings.embeddingModel || "bge-m3";
  const apiBase = ctx.settings.embeddingApiBaseUrl || "http://localhost:11434/v1";
  const apiKey = getEmbeddingApiKey(ctx.app);

  if (!ctx.nodes || ctx.nodes.length === 0) {
    await ctx.scanVaultNotes();
  }

  const total = ctx.nodes.length;
  if (total === 0) {
    setHoverBarText(hoverBar, "[WARN] Keine Notizen im Vault zum Berechnen von Vektoren gefunden.", "warning");
    return;
  }

  setActionBtnEnabled(btn, false);
  statusText.setText(`Vektoren 0/${total}...`);

  let successCount = 0;
  let lastError: string | null = null;
  const points: VectorPoint[] = [];

  for (let i = 0; i < total; i++) {
    const node = ctx.nodes[i];
    setHoverBarText(hoverBar, `[INFO] Berechne Embeddings mit '${embedModel}' (${i + 1}/${total}): ${node.title}...`, "muted");

    const sampleText = `${node.title}\n${node.content}`.slice(0, 2000);
    const res = await fetchEmbedding(sampleText, apiBase, apiKey, embedModel);

    if (res.error) {
      lastError = res.error;
      setHoverBarText(hoverBar, `[ERROR] Embedding Fehler (${i + 1}/${total}): ${res.error}`, "error");
      new Notice(`[ERROR] Embedding Fehler: ${res.error}`, 8000);
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

  if (points.length > 0) {
    try {
      const vectorStore = getVectorStore(ctx.app, ctx.settings);
      await vectorStore.syncPoints(points);
    } catch (syncErr) {
      console.error("MemVector: Failed to persist calculated vectors to SQLite:", syncErr);
    }
  }

  setActionBtnEnabled(btn, true);

  const vT = getTranslation(ctx.settings.language || "de");

  if (successCount === total) {
    ctx.applyLayout();
    ctx.redraw();
    setHoverBarText(hoverBar, `[OK] ${successCount}/${total} ${vT.noticeVectorsCalc} '${embedModel}' ${vT.noticeVectorsCalcSuffix}`, "muted");
    statusText.setText(`${total} | Vektoren OK`);
    new Notice(`[OK] ${successCount} ${vT.noticeVectorsCalc} '${embedModel}' ${vT.noticeVectorsCalcSuffix}`);
  } else if (lastError) {
    statusText.setText(`Fehler (${successCount}/${total})`);
  }
}
