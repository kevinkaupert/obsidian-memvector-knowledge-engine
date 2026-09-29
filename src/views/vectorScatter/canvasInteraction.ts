import { TFile } from "obsidian";
import type { ScatterViewContext } from "./context";
import { getTranslation } from "../../i18n";
import { worldToScreen } from "./hitTesting";

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
  updateSelectionUI: (this: void) => void;
}

/**
 * Purpose: Attaches pan, zoom, lasso, click selection, and navigation event listeners to the canvas element.
 */
export function wireCanvasInteraction(ctx: ScatterViewContext, refs: CanvasInteractionRefs): () => void {
  const { canvas, canvasWrap, hoverBar, updateSelectionUI } = refs;

  let wasDragging = false;
  let mouseDownX = 0;
  let mouseDownY = 0;

  // Trackpad wheel and mousemove events can fire far faster than the display's refresh
  // rate; redrawing once per raw event (rather than coalesced to one per frame) overloads
  // the compositor and was observed to leak rendering artifacts into unrelated panes
  // (tab bar, sidebar) while this view was open.
  // The frame is requested on the window the canvas actually belongs to. A bare `window.`
  // prefix does not do that: it resolves to the window the plugin was loaded in, so a view
  // dragged into an Obsidian popout would schedule frames on a window it no longer lives in.
  // `canvas.win` is resolved per call, so a migrated canvas schedules on its new window
  // without any re-binding, and the handle is kept together with the window that issued it -
  // cancelling on a different window would silently do nothing.
  let pendingRedraw: { win: Window; handle: number } | null = null;
  const scheduleRedraw = (): void => {
    if (pendingRedraw !== null) return;
    const win = canvas.win;
    pendingRedraw = {
      win,
      handle: win.requestAnimationFrame(() => {
        pendingRedraw = null;
        ctx.redraw();
      }),
    };
  };

  const cancelPendingRedraw = (): void => {
    if (pendingRedraw === null) return;
    pendingRedraw.win.cancelAnimationFrame(pendingRedraw.handle);
    pendingRedraw = null;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (e.ctrlKey || (Math.abs(e.deltaY) > 30 && Math.abs(e.deltaX) < 5)) {
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const newZoom = Math.max(0.05, Math.min(8, ctx.zoom * zoomFactor));
      ctx.pan.x = mouseX - (mouseX - ctx.pan.x) * (newZoom / ctx.zoom);
      ctx.pan.y = mouseY - (mouseY - ctx.pan.y) * (newZoom / ctx.zoom);
      ctx.zoom = newZoom;
    } else {
      ctx.pan.x -= e.deltaX * 0.9;
      ctx.pan.y -= e.deltaY * 0.9;
    }
    scheduleRedraw();
  };

  const onMouseDown = (e: MouseEvent) => {
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
      canvas.addClass("is-grabbing");
    }
  };

  const onMouseMove = (e: MouseEvent) => {
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
      scheduleRedraw();
    } else if (ctx.isDraggingLasso) {
      ctx.lassoPath.push({ x: mouseX, y: mouseY });
      scheduleRedraw();
    } else {
      const hovered = ctx.hitTest(mouseX, mouseY);
      let needsRedraw = false;
      if (hovered !== ctx.hoveredNode) {
        ctx.hoveredNode = hovered;
        if (hovered) {
          hoverBar.setText(hovered.title);
        } else {
          hoverBar.setText(getTranslation(ctx.settings.language || "de").hoverHint);
        }
        needsRedraw = true;
      }

      // Only shows a relation's type/description text on hover (drawEdges.ts) -
      // otherwise several relations between the same pair would each paint
      // their own label over one another. Suppressed while hovering a node so
      // the two hover states never fight over the same screen position.
      const hoveredEdge = !hovered && ctx.showEdges ? ctx.hitTestEdge(mouseX, mouseY) : null;
      if (hoveredEdge !== ctx.hoveredEdge) {
        ctx.hoveredEdge = hoveredEdge;
        needsRedraw = true;
      }

      if (needsRedraw) scheduleRedraw();
    }
  };

  const onMouseUp = () => {
    if (ctx.isDraggingPan) {
      ctx.isDraggingPan = false;
      canvas.removeClass("is-grabbing");
      if (ctx.lassoSelectMode) {
        canvas.addClass("is-crosshair");
      } else {
        canvas.removeClass("is-crosshair");
      }
    }
    if (ctx.isDraggingLasso) {
      ctx.isDraggingLasso = false;
      if (ctx.lassoPath.length > 2) {
        wasDragging = true; // Prevent click from clearing the lasso selection
        ctx.getVisibleNodes().forEach((node) => {
          const screenPos = worldToScreen(node.x, node.y, ctx.zoom, ctx.pan);
          if (isPointInPolygon(screenPos.x, screenPos.y, ctx.lassoPath)) {
            ctx.selectedNodeIds.add(node.id);
          }
        });
      }
      ctx.lassoPath = [];
      updateSelectionUI();
    }
  };

  const onClick = (e: MouseEvent) => {
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
  };

  const onDblClick = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const clicked = ctx.hitTest(mouseX, mouseY);
    if (clicked) {
      ctx.pan.x = canvasWrap.clientWidth / 2 - clicked.x * ctx.zoom;
      ctx.pan.y = canvasWrap.clientHeight / 2 - clicked.y * ctx.zoom;
      ctx.redraw();
      // Open by resolved file, not `clicked.id` - that's the canonical (path-based)
      // storage identity, not valid WikiLink/linktext for openLinkText.
      const file = ctx.app.vault.getAbstractFileByPath(clicked.path);
      if (file instanceof TFile) void ctx.app.workspace.getLeaf(true).openFile(file);
    }
  };

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("dblclick", onDblClick);
  // mouseup is tracked window-wide so a drag that ends outside the canvas still completes.
  // It therefore has to follow the canvas when the view moves to another window, otherwise
  // the release is observed by a window the user is no longer interacting with.
  let mouseUpWin: Window = canvas.win;
  mouseUpWin.addEventListener("mouseup", onMouseUp);

  const stopWatchingMigration = canvas.onWindowMigrated((win) => {
    // Both the pending frame and the listener belong to the window just left.
    cancelPendingRedraw();
    mouseUpWin.removeEventListener("mouseup", onMouseUp);
    mouseUpWin = win;
    mouseUpWin.addEventListener("mouseup", onMouseUp);
  });

  return () => {
    // A frame scheduled by the last mousemove must not survive the view: it would
    // redraw a detached canvas after onClose (the teardown that PR #114 added for
    // the listeners has to cover the pending frame too).
    stopWatchingMigration();
    cancelPendingRedraw();
    mouseUpWin.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("dblclick", onDblClick);
  };
}
