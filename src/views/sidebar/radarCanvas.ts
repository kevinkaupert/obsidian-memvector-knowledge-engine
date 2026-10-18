/**
 * Purpose: Draws the sidebar radar and wires its zoom, pan, drag, reset, tooltip and click navigation.
 * Architecture: Split out of renderActiveNoteFocus (#76). The view state lives in one RadarState object that every
 * handler reads by property at event time (double click replaces `pan`). Drawing writes each node's screen position
 * onto the same RadarNode objects the hover and click handlers hit-test.
 */

import type { RadarNode } from "./radarGeometry";

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

export interface RadarState {
  zoom: number;
  pan: { x: number; y: number };
  isDragging: boolean;
  dragStart: { x: number; y: number };
  mouseDownPos: { x: number; y: number };
}

export interface RadarSpec {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  maxRadius: number;
  scoreLabel: string;
  nodes: RadarNode[];
}

export function createRadarState(): RadarState {
  return { zoom: 1.0, pan: { x: 0, y: 0 }, isDragging: false, dragStart: { x: 0, y: 0 }, mouseDownPos: { x: 0, y: 0 } };
}

export function drawRadar(spec: RadarSpec, state: RadarState): void {
  const { ctx, width, height, centerX, centerY, maxRadius, scoreLabel } = spec;
  ctx.clearRect(0, 0, width, height);
  const cX = centerX + state.pan.x;
  const cY = centerY + state.pan.y;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  [0.25, 0.5, 0.75, 1.0].forEach((rRatio) => {
    ctx.beginPath();
    ctx.arc(cX, cY, maxRadius * rRatio * state.zoom, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, cY);
  ctx.lineTo(width, cY);
  ctx.moveTo(cX, 0);
  ctx.lineTo(cX, height);
  ctx.stroke();
  ctx.setLineDash([]);

  const centerSize = Math.max(4, 7 * Math.sqrt(state.zoom));
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

  spec.nodes.forEach((node) => {
    node.x = cX + node.dx * state.zoom;
    node.y = cY + node.dy * state.zoom;
  });

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const miniHeatRadius = 35 * state.zoom;
  spec.nodes.forEach((node) => {
    const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, miniHeatRadius);
    grad.addColorStop(0, "rgba(6, 182, 212, 0.25)");
    grad.addColorStop(0.5, "rgba(59, 130, 246, 0.08)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(node.x, node.y, miniHeatRadius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  spec.nodes.forEach((node) => {
    const dotRadius = Math.max(3.5, 5 * Math.sqrt(state.zoom));
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
  ctx.fillText(scoreLabel, 8, 14);
  ctx.textAlign = "right";
  ctx.fillText(`N=${spec.nodes.length}`, width - 8, 14);
}

/** Attaches the radar's mouse handlers; `open` navigates to a clicked neighbor. */
export function wireRadarInteraction(
  canvas: HTMLCanvasElement,
  radarTooltip: HTMLElement,
  spec: RadarSpec,
  state: RadarState,
  open: (node: RadarNode) => void
): void {
  const { width, centerX, centerY } = spec;
  const redraw = () => drawRadar(spec, state);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (e.ctrlKey || (Math.abs(e.deltaY) > 30 && Math.abs(e.deltaX) < 5)) {
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        const newZoom = Math.min(5.0, Math.max(0.2, state.zoom * zoomFactor));
        state.pan.x = mx - (mx - (centerX + state.pan.x)) * (newZoom / state.zoom) - centerX;
        state.pan.y = my - (my - (centerY + state.pan.y)) * (newZoom / state.zoom) - centerY;
        state.zoom = newZoom;
      } else {
        state.pan.x -= e.deltaX * 0.85;
        state.pan.y -= e.deltaY * 0.85;
      }
      redraw();
    },
    { passive: false }
  );

  canvas.onmousedown = (e) => {
    state.isDragging = true;
    state.mouseDownPos = { x: e.clientX, y: e.clientY };
    state.dragStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
    canvas.addClass("is-grabbing");
    radarTooltip.hidden = true;
  };

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (state.isDragging) {
      state.pan.x = e.clientX - state.dragStart.x;
      state.pan.y = e.clientY - state.dragStart.y;
      radarTooltip.hidden = true;
      redraw();
    } else {
      const found = spec.nodes.find((n) => Math.hypot(mx - n.x, my - n.y) <= 16);
      canvas.title = found ? found.file.name : "";
      if (found) {
        radarTooltip.setText(found.file.name);
        radarTooltip.hidden = false;
        radarTooltip.style.left = `${Math.max(5, Math.min(mx + 10, width - 140))}px`;
        radarTooltip.style.top = `${Math.max(5, my - 28)}px`;
      } else {
        radarTooltip.hidden = true;
      }
    }
  };

  canvas.onmouseleave = () => {
    radarTooltip.hidden = true;
  };

  canvas.onmouseup = () => {
    if (state.isDragging) {
      state.isDragging = false;
      canvas.removeClass("is-grabbing");
    }
  };

  canvas.ondblclick = () => {
    state.zoom = 1.0;
    state.pan = { x: 0, y: 0 };
    redraw();
  };

  canvas.onclick = (e) => {
    const moveDist = Math.hypot(e.clientX - state.mouseDownPos.x, e.clientY - state.mouseDownPos.y);
    if (moveDist > 5) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const found = spec.nodes.find((n) => Math.hypot(mx - n.x, my - n.y) <= 14);
    if (found) {
      open(found);
    }
  };
}
