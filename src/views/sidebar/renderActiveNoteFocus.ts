import { TFile, type App } from "obsidian";
import type { DomElementInfoCompat } from "../../obsidianCompat";
import { getVectorStore } from "../../sync/storeFactory";
import type { MemVectorSettings } from "../../settings/types";
import { classifyNoteType, extractFormulas, rankCandidates, shouldExcludeFromRadar, type ScoredNote } from "./activeNoteScoring";
import { getNode2DPosition } from "./nodePosition";

/**
 * Tries the real vector index first (semantic nearest-neighbors via whichever
 * backend is configured), falling back to null if the active note hasn't been
 * synced yet or the backend is unreachable - callers fall back to the local
 * word/formula-overlap heuristic (rankCandidates) in that case, so the radar
 * never just breaks for an unsynced vault.
 */
async function findVectorNeighbors(app: App, settings: MemVectorSettings, activeFile: TFile, limit: number): Promise<ScoredNote[] | null> {
  try {
    const store = getVectorStore(app, settings);
    const activeVector = await store.getVector(activeFile.path);
    if (!activeVector) return null;

    const hits = await store.search(activeVector, limit + 1);
    const seen = new Set<string>([activeFile.path]);
    const neighbors: ScoredNote[] = [];
    for (const hit of hits) {
      if (seen.has(hit.payload.path)) continue;
      const file = app.vault.getAbstractFileByPath(hit.payload.path);
      if (!(file instanceof TFile)) continue;
      seen.add(hit.payload.path);
      neighbors.push({
        file,
        type: classifyNoteType(file.path, file.name),
        score: hit.score,
        formulas: extractFormulas(hit.payload.content || ""),
        content: hit.payload.content || "",
      });
    }
    return neighbors.length > 0 ? neighbors : null;
  } catch (err) {
    console.warn("Vector-based radar neighbors unavailable, falling back to local scoring:", err);
    return null;
  }
}

const TYPE_COLORS: Record<string, string> = {
  definition: "#3b82f6",
  theorem: "#10b981",
  concept: "#f59e0b",
  relation: "#8b5cf6",
  synthesis: "#ec4899",
  course: "#6366f1",
  question: "#ef4444",
  source: "#6b7280",
};

interface RadarNode extends ScoredNote {
  dx: number;
  dy: number;
  dist: number;
  x: number;
  y: number;
}

export async function renderActiveNoteFocus(
  app: App,
  container: HTMLElement,
  pluginSettings: MemVectorSettings | undefined,
  focusFile?: TFile
): Promise<void> {
  const activeFile = focusFile || app.workspace.getActiveFile();
  if (!activeFile) return;

  const focusBox = container.createEl("div");
  Object.assign(focusBox.style, {
    background: "var(--background-secondary)",
    borderRadius: "12px",
    padding: "12px",
    marginBottom: "15px",
    border: "1px solid var(--border-color)",
  });

  const pathParts = activeFile.path.split("/");
  const breadcrumb = pathParts.length > 1 ? pathParts.slice(0, -1).join(" > ") : "";
  if (breadcrumb) {
    focusBox.createEl("div", {
      text: breadcrumb,
      style: "font-size: 0.8em; color: var(--text-muted); margin-bottom: 2px;",
    } as DomElementInfoCompat);
  }
  focusBox.createEl("div", {
    text: activeFile.name,
    style: "font-size: 1.15em; font-weight: bold; margin-bottom: 10px; color: var(--text-normal);",
  } as DomElementInfoCompat);

  const radarWrap = focusBox.createEl("div");
  Object.assign(radarWrap.style, {
    position: "relative",
    width: "100%",
    height: "260px",
    borderRadius: "10px",
    background: "var(--background-primary-alt, var(--background-secondary))",
    border: "1px solid var(--background-modifier-border, var(--border-color, rgba(255, 255, 255, 0.1)))",
    overflow: "hidden",
    marginBottom: "10px",
  });

  const canvas = radarWrap.createEl("canvas");
  Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", cursor: "pointer" });
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const radarTooltip = radarWrap.createEl("div", {
    style:
      "position: absolute; display: none; pointer-events: none; padding: 4px 8px; border-radius: 6px; background: var(--background-secondary, #0f172a); border: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.2)); color: var(--text-normal, #f1f5f9); font-size: 0.78em; font-weight: 500; font-family: var(--font-interface, sans-serif); z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.35); white-space: nowrap;",
  } as DomElementInfoCompat);

  try {
    const activeContent = await app.vault.read(activeFile);
    const countX = pluginSettings?.radarNoteCount || 10;
    const wantCount = Math.max(15, countX);

    let topNeighbors = pluginSettings ? await findVectorNeighbors(app, pluginSettings, activeFile, wantCount) : null;

    if (!topNeighbors) {
      const candidateFiles = app.vault.getMarkdownFiles().filter((f) => f.path !== activeFile.path && !shouldExcludeFromRadar(f));
      const candidates: { file: TFile; content: string }[] = [];
      for (const f of candidateFiles) {
        candidates.push({ file: f, content: await app.vault.read(f) });
      }
      topNeighbors = rankCandidates(activeContent, candidates).slice(0, wantCount);
    }

    const width = radarWrap.clientWidth || 260;
    const height = 260;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const centerX = width / 2;
    const centerY = height / 2;
    const activePos = getNode2DPosition(app, activeFile, activeContent);

    const neighborNodes: RadarNode[] = topNeighbors.map((item) => {
      const nPos = getNode2DPosition(app, item.file as TFile, item.content);
      const dx = nPos.x - activePos.x;
      const dy = nPos.y - activePos.y;
      return { ...item, dx, dy, dist: Math.hypot(dx, dy), x: 0, y: 0 };
    });

    const framedNeighbors = neighborNodes.slice(0, countX);
    let maxDist = 0;
    framedNeighbors.forEach((n) => {
      if (n.dist > maxDist) maxDist = n.dist;
    });
    if (maxDist === 0) maxDist = 1;

    const maxRadius = Math.min(width, height) * 0.38;
    const baseScale = maxRadius / maxDist;

    let radarZoom = 1.0;
    let radarPan = { x: 0, y: 0 };
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };

    const drawRadar = () => {
      ctx.clearRect(0, 0, width, height);
      const cX = centerX + radarPan.x;
      const cY = centerY + radarPan.y;
      const effectiveScale = baseScale * radarZoom;

      ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      [0.25, 0.5, 0.75, 1.0].forEach((rRatio) => {
        ctx.beginPath();
        ctx.arc(cX, cY, maxRadius * rRatio * radarZoom, 0, Math.PI * 2);
        ctx.stroke();
      });

      ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, cY);
      ctx.lineTo(width, cY);
      ctx.moveTo(cX, 0);
      ctx.lineTo(cX, height);
      ctx.stroke();
      ctx.setLineDash([]);

      const centerSize = Math.max(4, 7 * Math.sqrt(radarZoom));
      ctx.beginPath();
      ctx.arc(cX, cY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#06b6d4";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cX - centerSize, cY);
      ctx.lineTo(cX + centerSize, cY);
      ctx.moveTo(cX, cY - centerSize);
      ctx.lineTo(cX, cY + centerSize);
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      neighborNodes.forEach((node) => {
        node.x = cX + node.dx * effectiveScale;
        node.y = cY + node.dy * effectiveScale;
      });

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const miniHeatRadius = 45 * radarZoom;
      neighborNodes.forEach((node) => {
        const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, miniHeatRadius);
        grad.addColorStop(0, "rgba(6, 182, 212, 0.22)");
        grad.addColorStop(0.5, "rgba(59, 130, 246, 0.08)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(node.x, node.y, miniHeatRadius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      neighborNodes.forEach((node) => {
        const dotRadius = Math.max(3.5, 4.5 * Math.sqrt(radarZoom));
        ctx.beginPath();
        ctx.arc(node.x, node.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = TYPE_COLORS[node.type] || "#94a3b8";
        ctx.fill();
        ctx.strokeStyle = "rgba(15, 23, 42, 0.8)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText("PROJ: 2D VECTOR SPACE", 8, 14);
      ctx.textAlign = "right";
      ctx.fillText(`N=${neighborNodes.length}`, width - 8, 14);
    };

    drawRadar();

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (e.ctrlKey || (Math.abs(e.deltaY) > 30 && Math.abs(e.deltaX) < 5)) {
          const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
          const newZoom = Math.min(5.0, Math.max(0.2, radarZoom * zoomFactor));
          radarPan.x = mx - (mx - (centerX + radarPan.x)) * (newZoom / radarZoom) - centerX;
          radarPan.y = my - (my - (centerY + radarPan.y)) * (newZoom / radarZoom) - centerY;
          radarZoom = newZoom;
        } else {
          radarPan.x -= e.deltaX * 0.85;
          radarPan.y -= e.deltaY * 0.85;
        }
        drawRadar();
      },
      { passive: false }
    );

    let mouseDownPos = { x: 0, y: 0 };

    canvas.onmousedown = (e) => {
      isDragging = true;
      mouseDownPos = { x: e.clientX, y: e.clientY };
      dragStart = { x: e.clientX - radarPan.x, y: e.clientY - radarPan.y };
      canvas.style.cursor = "grabbing";
      radarTooltip.style.display = "none";
    };

    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (isDragging) {
        radarPan.x = e.clientX - dragStart.x;
        radarPan.y = e.clientY - dragStart.y;
        radarTooltip.style.display = "none";
        drawRadar();
      } else {
        const found = neighborNodes.find((n) => Math.hypot(mx - n.x, my - n.y) <= 16);
        canvas.title = found ? found.file.name : "";
        if (found) {
          radarTooltip.setText(found.file.name);
          radarTooltip.style.display = "block";
          radarTooltip.style.left = `${Math.max(5, Math.min(mx + 10, width - 140))}px`;
          radarTooltip.style.top = `${Math.max(5, my - 28)}px`;
        } else {
          radarTooltip.style.display = "none";
        }
      }
    };

    canvas.onmouseleave = () => {
      radarTooltip.style.display = "none";
    };

    canvas.onmouseup = () => {
      if (isDragging) {
        isDragging = false;
        canvas.style.cursor = "pointer";
      }
    };

    canvas.ondblclick = () => {
      radarZoom = 1.0;
      radarPan = { x: 0, y: 0 };
      drawRadar();
    };

    canvas.onclick = (e) => {
      const moveDist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
      if (moveDist > 5) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const found = neighborNodes.find((n) => Math.hypot(mx - n.x, my - n.y) <= 14);
      if (found) {
        app.workspace.openLinkText(found.file.basename, found.file.path, true);
      }
    };

    const detailsEl = focusBox.createEl("details");
    detailsEl.open = true;
    detailsEl.style.marginTop = "8px";
    detailsEl.createEl("summary", {
      text: "Nahestehende Notizen",
      style: "cursor: pointer; font-size: 0.85em; color: var(--text-muted); font-weight: 500;",
    } as DomElementInfoCompat);

    const listContainer = detailsEl.createEl("div");
    listContainer.style.marginTop = "8px";

    topNeighbors.slice(0, 5).forEach((item, idx) => {
      const row = listContainer.createEl("div");
      Object.assign(row.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "4px 8px",
        margin: "3px 0",
        borderRadius: "4px",
        background: "var(--background-primary)",
        cursor: "pointer",
        fontSize: "0.85em",
      });

      const nameSpan = row.createEl("span", { text: `${idx + 1}. ${item.file.basename}` });
      nameSpan.style.color = "var(--text-accent)";
      const scoreSpan = row.createEl("span", { text: item.score.toFixed(3) });
      scoreSpan.style.color = "var(--text-muted)";

      row.onclick = () => {
        app.workspace.openLinkText(item.file.basename, item.file.path, true);
      };
    });
  } catch (err) {
    console.error("Error rendering active note radar focus:", err);
  }
}
