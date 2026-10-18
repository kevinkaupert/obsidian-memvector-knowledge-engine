import { type TFile, type App } from "obsidian";
import type { MemVectorSettings } from "../../settings/types";
import {
  limitToConfiguredCount,
  resolveRadarFetchCount,
} from "./activeNoteScoring";
import { getNode2DPositions } from "./nodePosition";
import { loadRadarNeighbors } from "./radarNeighbors";
import { renderRetrievalWarning } from "../../retrievalStatus";
import { getTranslation } from "../../i18n";
import { placeRadarNeighbors } from "./radarGeometry";
import { createRadarState, drawRadar, wireRadarInteraction, type RadarSpec } from "./radarCanvas";

/**
 * Purpose: Renders the active note radar widget displaying semantic and structural neighbors in a circular canvas and list.
 */
export async function renderActiveNoteFocus(
  app: App,
  container: HTMLElement,
  pluginSettings: MemVectorSettings | undefined,
  focusFile?: TFile,
  isCurrent?: () => boolean
): Promise<void> {
  const activeFile = focusFile || app.workspace.getActiveFile();
  if (!activeFile) return;

  const t = getTranslation(pluginSettings?.language || "de");
  const focusBox = container.createDiv({ cls: "memvector-focus-box" });

  const pathParts = activeFile.path.split("/");
  const breadcrumb = pathParts.length > 1 ? pathParts.slice(0, -1).join(" > ") : "";
  if (breadcrumb) {
    focusBox.createDiv({
      text: breadcrumb,
      cls: "memvector-focus-breadcrumb",
    });
  }
  focusBox.createDiv({
    text: activeFile.name,
    cls: "memvector-focus-title",
  });

  const radarWrap = focusBox.createDiv({ cls: "memvector-radar-wrap" });

  const canvas = radarWrap.createEl("canvas", { cls: "memvector-radar-canvas" });
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const radarTooltip = radarWrap.createDiv({ cls: "memvector-radar-tooltip" });
  radarTooltip.hidden = true;

  try {
    const activeContent = await app.vault.cachedRead(activeFile);
    if (isCurrent && !isCurrent()) return;

    const countX = pluginSettings?.radarNoteCount || 10;
    const wantCount = resolveRadarFetchCount(countX);

    const result = await loadRadarNeighbors(app, pluginSettings, activeFile, activeContent, wantCount);
    if (isCurrent && !isCurrent()) return;
    const semantic = result.status === "ready";
    const scoreLabel = semantic ? t.radarSemantic : t.radarHeuristic;
    if (!semantic) {
      renderRetrievalWarning(focusBox, result.status === "error" ? t.radarStoreFailed : t.radarUnindexed);
      focusBox.addClass("memvector-radar-heuristic");
    }
    let topNeighbors = result.data;

    // wantCount over-fetched for ranking quality; only the configured count is actually shown.
    topNeighbors = limitToConfiguredCount(topNeighbors, countX);

    const width = radarWrap.clientWidth || 260;
    const height = 260;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const centerX = width / 2;
    const centerY = height / 2;
    const positions = await getNode2DPositions(app, [{ file: activeFile, content: activeContent }, ...topNeighbors]);
    if (isCurrent && !isCurrent()) return;
    const activePos = positions.get(activeFile.path)!;
    const maxRadius = Math.min(width, height) * 0.42;

    const neighborNodes = placeRadarNeighbors(topNeighbors, positions, activePos, maxRadius);

    const state = createRadarState();
    const spec: RadarSpec = { ctx, width, height, centerX, centerY, maxRadius, scoreLabel, nodes: neighborNodes };
    drawRadar(spec, state);
    wireRadarInteraction(canvas, radarTooltip, spec, state, (found) => {
      void app.workspace.openLinkText(found.file.basename, found.file.path, true);
    });

    const detailsEl = focusBox.createEl("details", { cls: "memvector-radar-details" });
    detailsEl.open = true;
    detailsEl.createEl("summary", {
      text: t.sidebarNearbyNotes,
      cls: "memvector-muted-text",
    });

    const listContainer = detailsEl.createDiv({ cls: "memvector-radar-list" });

    // Text list is intentionally capped independently of radarNoteCount/canvas count.
    topNeighbors.slice(0, 5).forEach((item, idx) => {
      const row = listContainer.createDiv({ cls: "memvector-radar-row" });
      row.createSpan({ text: `${idx + 1}. ${item.file.basename}`, cls: "memvector-radar-name" });
      row.createSpan({ text: semantic ? item.score.toFixed(3) : `≈ ${item.score.toFixed(2)}`, cls: "memvector-radar-score", attr: { title: scoreLabel } });

      row.onclick = () => {
        void app.workspace.openLinkText(item.file.basename, item.file.path, true);
      };
    });
  } catch (err) {
    console.error("Error rendering active note radar focus:", err);
  }
}
