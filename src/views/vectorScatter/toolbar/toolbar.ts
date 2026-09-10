import { Notice } from "obsidian";
import { getTranslation, type TranslationKeys } from "../../../i18n";
import { fetchEmbedding } from "../../../llm/fetchEmbedding";
import { getShortModelName } from "../../../llm/getShortModelName";
import { getEmbeddingApiKey } from "../../../settings/secrets";
import { getVectorStore } from "../../../sync/storeFactory";
import type { VectorPoint } from "../../../sync/vectorStore";
import type { MemVectorSettings, ScatterVisualStyle } from "../../../settings/types";
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

  const panelHeader = toolbarEl.createEl("div");
  panelHeader.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:9px 12px; border-bottom:1px solid var(--background-modifier-border, rgba(255,255,255,0.05));";
  const headerLeft = panelHeader.createEl("div");
  headerLeft.style.cssText = "display:flex; align-items:center; gap:8px;";
  const titleDot = headerLeft.createEl("div");
  titleDot.style.cssText = "width:7px; height:7px; border-radius:50%; background:#06b6d4; box-shadow:0 0 8px #06b6d4; flex-shrink:0;";
  const statusText = panelHeader.createEl("span", { text: "–" });
  statusText.style.cssText = "font-family:var(--font-monospace); font-size:0.75em; color:var(--text-muted, #94a3b8); font-weight:600;";

  // ── Filter ────────────────────────────────────────────────────────────
  const filterBody = createSection(toolbarEl, t.secFilter, true);

  const searchInput = filterBody.createEl("input", {
    type: "text",
    placeholder: t.searchPlaceholder,
  });
  searchInput.style.cssText =
    "display:block; width:calc(100% - 24px); margin:4px 12px 8px; box-sizing:border-box; font-size:0.76em; padding:6px 10px; border-radius:6px; border:1px solid var(--background-modifier-border, rgba(255,255,255,0.1)); outline:none; background:var(--background-primary, var(--background-secondary)); color:var(--text-normal); user-select:text; -webkit-user-select:text; cursor:text;";
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
  });
  filterInput.value = ctx.settings.vectorSearchExclusions || "";
  filterInput.style.cssText =
    "display:block; width:calc(100% - 24px); margin:4px 12px 8px; box-sizing:border-box; font-size:0.76em; padding:6px 10px; border-radius:6px; border:1px solid var(--background-modifier-border, rgba(255,255,255,0.1)); outline:none; background:var(--background-primary, var(--background-secondary)); color:var(--text-normal); user-select:text; -webkit-user-select:text; cursor:text;";
  filterInput.onmousedown = (e) => e.stopPropagation();
  filterInput.onmouseup = (e) => e.stopPropagation();
  filterInput.onclick = (e) => e.stopPropagation();
  filterInput.onkeydown = (e) => e.stopPropagation();

  let filterDebounce: number | null = null;
  filterInput.oninput = () => {
    if (filterDebounce) window.clearTimeout(filterDebounce);
    filterDebounce = window.setTimeout(async () => {
      const val = filterInput.value.trim();
      ctx.settings.vectorSearchExclusions = val;
      await ctx.saveSettings();
      await ctx.scanVaultNotes(val);
      statusText.setText(`${ctx.nodes.length}`);
      ctx.redraw();
    }, 250);
  };

  // ── Ansicht ───────────────────────────────────────────────────────────
  const ansichtBody = createSection(toolbarEl, t.secView, true);

  createDropdown(
    ansichtBody,
    t.lblVisualStyle,
    VISUAL_STYLE_OPTIONS.map((s) => ({ id: s.id, label: t[s.labelKey] || s.fallback })),
    ctx.settings.scatterVisualStyle || "ink",
    async (newStyle) => {
      ctx.settings.scatterVisualStyle = newStyle as MemVectorSettings["scatterVisualStyle"];
      await ctx.saveSettings();
      ctx.redraw();
    }
  );

  if (!ctx.nodeSpacing || ctx.nodeSpacing < 250) {
    ctx.nodeSpacing = ctx.settings.scatterNodeSpacing || 350;
  }
  if (!ctx.cloudSpacing || ctx.cloudSpacing < 500) {
    ctx.cloudSpacing = ctx.settings.scatterCloudSpacing || 800;
  }

  createSlider(ansichtBody, "Punkt-Abstand", 120, 1600, 20, ctx.nodeSpacing, (val) => `${Math.round(val / 40)}`, async (newVal) => {
    ctx.nodeSpacing = newVal;
    ctx.settings.scatterNodeSpacing = newVal;
    await ctx.saveSettings();
    ctx.applyLayout();
    ctx.redraw();
  });
  createSlider(ansichtBody, "Wolken-Abstand", 300, 3000, 50, ctx.cloudSpacing, (val) => `${Math.round(val / 100)}`, async (newVal) => {
    ctx.cloudSpacing = newVal;
    ctx.settings.scatterCloudSpacing = newVal;
    await ctx.saveSettings();
    ctx.applyLayout();
    ctx.redraw();
  });
  let edgeHopsRow: HTMLElement | null = null;
  createToggle(ansichtBody, t.lblShowEdges, ctx.showEdges, async (on) => {
    ctx.showEdges = on;
    if (edgeHopsRow) edgeHopsRow.style.display = on ? "flex" : "none";
    if (on) await ctx.loadRelationEdges();
    ctx.redraw();
  });
  const edgeHopsSelect = createDropdown(ansichtBody, t.lblEdgeHops, EDGE_HOP_OPTIONS(t), String(ctx.edgeHops), (val) => {
    // 0 ("Alle") is a valid, meaningful value here - `parseInt(val, 10) || 1`
    // would silently coerce it back to 1 since 0 is falsy in JS.
    const parsed = parseInt(val, 10);
    ctx.edgeHops = Number.isNaN(parsed) ? 1 : parsed;
    ctx.redraw();
  });
  edgeHopsRow = edgeHopsSelect.parentElement;
  if (edgeHopsRow) edgeHopsRow.style.display = ctx.showEdges ? "flex" : "none";

  createToggle(ansichtBody, t.lblLasso, ctx.lassoSelectMode, (on) => {
    ctx.lassoSelectMode = on;
    refs.canvas.style.cursor = on ? "crosshair" : "grab";
  });

  // ── Synthese ──────────────────────────────────────────────────────────
  const syntheseBody = createSection(toolbarEl, t.secSynthesis, false);

  const promptInput = syntheseBody.createEl("textarea", {
    placeholder: t.synthPromptPlaceholder,
  });
  promptInput.style.cssText =
    "display:block; width:calc(100% - 24px); margin:6px 12px 8px; box-sizing:border-box; font-size:0.76em; padding:6px 10px; min-height:56px; resize:vertical; border-radius:6px; border:1px solid var(--background-modifier-border, rgba(255,255,255,0.1)); outline:none; background:var(--background-primary, var(--background-secondary)); color:var(--text-normal); font-family:inherit; user-select:text; -webkit-user-select:text; cursor:text;";
  promptInput.onmousedown = (e) => e.stopPropagation();
  promptInput.onmouseup = (e) => e.stopPropagation();
  promptInput.onclick = (e) => e.stopPropagation();
  promptInput.onkeydown = (e) => e.stopPropagation();

  createToggle(syntheseBody, t.synthEnrichToggle, ctx.settings.enrichSynthesisContext, async (on) => {
    ctx.settings.enrichSynthesisContext = on;
    await ctx.saveSettings();
  });

  createToggle(syntheseBody, t.synthAgentsToggle, ctx.settings.includeAgentsGuidelines, async (on) => {
    ctx.settings.includeAgentsGuidelines = on;
    await ctx.saveSettings();
  });

  const fullModelName = ctx.settings.modelName || "LLM";
  const synthesizeBtn = createActionBtn(syntheseBody, `${getShortModelName(fullModelName)} ${t.secSynthesis} (0)`, null, true);
  synthesizeBtn.title = `LLM Model: ${fullModelName}`;
  synthesizeBtn.disabled = true;
  synthesizeBtn.style.opacity = "0.4";
  synthesizeBtn.style.cursor = "not-allowed";
  synthesizeBtn.onclick = () => ctx.runSynthesis((text) => hoverBar.setText(text), promptInput.value);

  // ── Aktionen ──────────────────────────────────────────────────────────
  const aktionenBody = createSection(toolbarEl, t.secActions, true);

  const refreshBtn = createActionBtn(aktionenBody, t.btnScanVault, null);
  refreshBtn.onclick = async () => {
    statusText.setText("Scanne Vault Notizen...");
    hoverBar.style.color = "var(--text-muted)";
    hoverBar.setText("Scanne Vault-Notizen...");
    await ctx.scanVaultNotes();
    statusText.setText(`${ctx.nodes.length}`);
    hoverBar.setText(`${ctx.nodes.length} Notizen erfolgreich im Vault gescannt.`);
    ctx.redraw();
  };

  createActionBtn(aktionenBody, "Ganzansicht zentrieren", () => {
    (ctx as any).fitToView?.();
    ctx.redraw();
  });

  const embedModelLabel = ctx.settings.embeddingModel || "bge-m3";
  const calcVectorsBtn = createActionBtn(aktionenBody, t.btnCalcVectors, null);
  calcVectorsBtn.title = `Embedding Model: ${embedModelLabel}`;
  calcVectorsBtn.onclick = () => runCalcVectors(ctx, calcVectorsBtn, statusText, hoverBar);

  const createRelBtn = createActionBtn(aktionenBody, `${t.btnCreateRel} (≥2)`, null);
  createRelBtn.disabled = true;
  createRelBtn.style.opacity = "0.35";
  createRelBtn.style.cursor = "not-allowed";
  createRelBtn.onclick = () => {
    const selected = ctx.nodes.filter((n) => ctx.selectedNodeIds.has(n.id));
    if (selected.length >= 2) ctx.openRelationBuilder(selected);
  };

  const clearSelBtn = createActionBtn(aktionenBody, t.btnClearSel, () => {
    ctx.selectedNodeIds.clear();
    updateSelectionUI();
  });

  hoverBar.setText(t.hoverHint);

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
    hoverBar.style.color = "var(--text-warning, #f59e0b)";
    hoverBar.setText("[WARN] Keine Notizen im Vault zum Berechnen von Vektoren gefunden.");
    return;
  }

  btn.disabled = true;
  btn.style.opacity = "0.5";
  statusText.setText(`Vektoren 0/${total}...`);

  let successCount = 0;
  let lastError: string | null = null;
  const points: VectorPoint[] = [];

  for (let i = 0; i < total; i++) {
    const node = ctx.nodes[i];
    hoverBar.style.color = "var(--text-muted)";
    hoverBar.setText(`[INFO] Berechne Embeddings mit '${embedModel}' (${i + 1}/${total}): ${node.title}...`);

    const sampleText = `${node.title}\n${node.content}`.slice(0, 2000);
    const res = await fetchEmbedding(sampleText, apiBase, apiKey, embedModel);

    if (res.error) {
      lastError = res.error;
      hoverBar.style.color = "var(--text-error, #f87171)";
      hoverBar.setText(`[ERROR] Embedding Fehler (${i + 1}/${total}): ${res.error}`);
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

  btn.disabled = false;
  btn.style.opacity = "1";

  const vT = getTranslation(ctx.settings.language || "de");

  if (successCount === total) {
    ctx.applyLayout();
    ctx.redraw();
    hoverBar.style.color = "var(--text-muted)";
    hoverBar.setText(`[OK] ${successCount}/${total} ${vT.noticeVectorsCalc} '${embedModel}' ${vT.noticeVectorsCalcSuffix}`);
    statusText.setText(`${total} | Vektoren OK`);
    new Notice(`[OK] ${successCount} ${vT.noticeVectorsCalc} '${embedModel}' ${vT.noticeVectorsCalcSuffix}`);
  } else if (lastError) {
    statusText.setText(`Fehler (${successCount}/${total})`);
  }
}
