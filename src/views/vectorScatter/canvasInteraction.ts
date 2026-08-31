import type { ScatterViewContext } from "./context";

function isPointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface CanvasInteractionRefs {
  canvas: HTMLCanvasElement;
  canvasWrap: HTMLElement;
  hoverBar: HTMLElement;
  updateSelectionUI(): void;
}

/** Wires pan/zoom/lasso-select/click-select/double-click-to-open on the canvas. Mirrors the original's mutation-of-`this` closures via `ctx`. */
export function wireCanvasInteraction(ctx: ScatterViewContext, refs: CanvasInteractionRefs): () => void {
  const { canvas, canvasWrap, hoverBar, updateSelectionUI } = refs;

  let wasDragging = false;
  let mouseDownX = 0;
  let mouseDownY = 0;

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (e.ctrlKey || (Math.abs(e.deltaY) > 30 && Math.abs(e.deltaX) < 5)) {
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        const newZoom = Math.max(0.2, Math.min(8, ctx.zoom * zoomFactor));
        ctx.pan.x = mouseX - (mouseX - ctx.pan.x) * (newZoom / ctx.zoom);
        ctx.pan.y = mouseY - (mouseY - ctx.pan.y) * (newZoom / ctx.zoom);
        ctx.zoom = newZoom;
      } else {
        ctx.pan.x -= e.deltaX * 0.9;
        ctx.pan.y -= e.deltaY * 0.9;
      }
      ctx.redraw();
    },
    { passive: false }
  );

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    wasDragging = false;
    mouseDownX = mouseX;
    mouseDownY = mouseY;

    const isLassoMode = ctx.lassoSelectMode || e.shiftKey;
    if (isLassoMode) {
      ctx.isDraggingLasso = true;
      ctx.lassoPath = [{ x: mouseX, y: mouseY }];
    } else {
      ctx.isDraggingPan = true;
      ctx.dragStart = { x: mouseX - ctx.pan.x, y: mouseY - ctx.pan.y };
      canvas.style.cursor = "grabbing";
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (!wasDragging) {
      const dx = mouseX - mouseDownX;
      const dy = mouseY - mouseDownY;
      if (Math.sqrt(dx * dx + dy * dy) > 4) wasDragging = true;
    }

    if (ctx.isDraggingPan) {
      ctx.pan.x = mouseX - ctx.dragStart.x;
      ctx.pan.y = mouseY - ctx.dragStart.y;
      ctx.redraw();
    } else if (ctx.isDraggingLasso) {
      ctx.lassoPath.push({ x: mouseX, y: mouseY });
      ctx.redraw();
    } else {
      const hovered = ctx.hitTest(mouseX, mouseY);
      if (hovered !== ctx.hoveredNode) {
        ctx.hoveredNode = hovered;
        if (hovered) {
          const mathSample = hovered.latexFormulas.length > 0 ? ` | Formel: $${hovered.latexFormulas[0]}$` : "";
          hoverBar.setText(`[${hovered.type.toUpperCase()}] ${hovered.title} (${hovered.path})${mathSample}`);
        } else {
          hoverBar.setText("Bewege die Maus über einen Vektor-Punkt. Ziehe mit gedrückter Shift-Taste oder Cmd-Klick zum Auswählen.");
        }
        ctx.redraw();
      }
    }
  });

  const onMouseUp = () => {
    if (ctx.isDraggingPan) {
      ctx.isDraggingPan = false;
      canvas.style.cursor = ctx.lassoSelectMode ? "crosshair" : "grab";
    }
    if (ctx.isDraggingLasso) {
      ctx.isDraggingLasso = false;
      if (ctx.lassoPath.length > 2) {
        wasDragging = true; // Prevent click from clearing the lasso selection
        ctx.nodes.forEach((node) => {
          const screenPos = { x: node.x * ctx.zoom + ctx.pan.x, y: node.y * ctx.zoom + ctx.pan.y };
          if (isPointInPolygon(screenPos.x, screenPos.y, ctx.lassoPath)) {
            ctx.selectedNodeIds.add(node.id);
          }
        });
      }
      ctx.lassoPath = [];
      updateSelectionUI();
    }
  };

  window.addEventListener("mouseup", onMouseUp);

  canvas.addEventListener("click", (e) => {
    if (wasDragging) {
      wasDragging = false;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const clicked = ctx.hitTest(mouseX, mouseY);

    if (clicked) {
      ctx.focusSidebar(clicked);
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (ctx.selectedNodeIds.has(clicked.id)) {
          ctx.selectedNodeIds.delete(clicked.id);
        } else {
          ctx.selectedNodeIds.add(clicked.id);
        }
        updateSelectionUI();
      } else {
        ctx.selectedNodeIds.clear();
        ctx.selectedNodeIds.add(clicked.id);
        updateSelectionUI();
      }
    } else if (ctx.showEdges) {
      const edge = ctx.hitTestEdge(mouseX, mouseY);
      if (edge) {
        ctx.editRelationEdge(edge);
        return;
      }
      if (ctx.selectedNodeIds.size > 0) {
        ctx.selectedNodeIds.clear();
        updateSelectionUI();
      }
    } else if (ctx.selectedNodeIds.size > 0) {
      ctx.selectedNodeIds.clear();
      updateSelectionUI();
    }
  });

  canvas.addEventListener("dblclick", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const clicked = ctx.hitTest(mouseX, mouseY);
    if (clicked) {
      ctx.pan.x = canvasWrap.clientWidth / 2 - clicked.x * ctx.zoom;
      ctx.pan.y = canvasWrap.clientHeight / 2 - clicked.y * ctx.zoom;
      ctx.redraw();
      ctx.app.workspace.openLinkText(clicked.id, clicked.path, true);
    }
  });

  return () => {
    window.removeEventListener("mouseup", onMouseUp);
  };
}
