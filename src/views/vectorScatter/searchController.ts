/**
 * Purpose: Search in the 2D view: finds notes by query, cycles through the matches on repeated Enter, centers the
 * camera on the match and pulses it for SEARCH_PULSE_DURATION_MS.
 * Architecture: Split out of VectorScatterView (#273). Camera, size, window and nodes are read through the host at
 * call time (`fitToView` replaces the pan object; the view can move into a popout window). The pulse frame is kept
 * with the window that scheduled it and cancelled against that window.
 */

import { Notice } from "obsidian";
import { getTranslation } from "../../i18n";
import type { MemVectorSettings } from "../../settings/types";
import type { PanState } from "./hitTesting";
import { findNodesByQuery } from "./search";
import type { ScatterNode } from "./types";

const SEARCH_PULSE_DURATION_MS = 1800;

export interface SearchHost {
  visibleNodes(): ScatterNode[];
  viewportSize(): { width: number; height: number };
  /** The current pan object; the search changes it in place. */
  pan(): PanState;
  zoom(): number;
  redraw(): void;
  win(): Window;
  settings(): MemVectorSettings;
}

export class SearchController {
  /** The note being pulsed; the view's redraw draws the pulse. */
  highlight: { nodeId: string; startedAt: number } | null = null;
  /**
   * Pending search-pulse frame, kept together with the window that issued it. The view can be
   * dragged into an Obsidian popout, which has its own window object; a bare `window.` prefix
   * resolves to the window the plugin was loaded in, so the pulse would be scheduled on - and
   * cancelled against - a window the view no longer lives in.
   */
  anim: { win: Window; handle: number } | null = null;
  lastQuery: string | null = null;
  lastMatches: ScatterNode[] = [];
  lastIndex = -1;

  constructor(private readonly host: SearchHost) {}

  /** Forgets the last query and its matches (after the node list changed); a running pulse continues. */
  resetMatches(): void {
    this.lastQuery = null;
    this.lastMatches = [];
    this.lastIndex = -1;
  }

  /** Repeated Enter on the same query cycles through every match (looping back to the first) instead of jumping to the best match each time. */
  search(query: string): void {
    const normalized = query.trim().toLowerCase();
    const isSameQuery = normalized === this.lastQuery && this.lastMatches.length > 0;

    if (isSameQuery) {
      this.lastIndex = (this.lastIndex + 1) % this.lastMatches.length;
    } else {
      this.lastQuery = normalized;
      this.lastMatches = findNodesByQuery(this.host.visibleNodes(), query);
      this.lastIndex = 0;
    }

    const match = this.lastMatches[this.lastIndex];
    if (!match) {
      const t = getTranslation(this.host.settings().language || "de");
      new Notice(`${t.searchNotFound} "${query}"`);
      return;
    }

    const { width, height } = this.host.viewportSize();
    const pan = this.host.pan();
    const zoom = this.host.zoom();
    pan.x = width / 2 - match.x * zoom;
    pan.y = height / 2 - match.y * zoom;

    this.cancelPulse();
    const startedAt = performance.now();
    this.highlight = { nodeId: match.id, startedAt };

    const tick = (): void => {
      this.host.redraw();
      if (performance.now() - startedAt < SEARCH_PULSE_DURATION_MS) {
        this.schedulePulse(tick);
      } else {
        this.highlight = null;
        this.anim = null;
        this.host.redraw();
      }
    };
    this.schedulePulse(tick);
  }

  /** Schedules the next pulse frame on the window the view currently lives in. */
  private schedulePulse(tick: () => void): void {
    const win = this.host.win();
    this.anim = { win, handle: win.requestAnimationFrame(tick) };
  }

  /** Cancels a pending pulse frame against the window that issued it. */
  cancelPulse(): void {
    if (this.anim === null) return;
    this.anim.win.cancelAnimationFrame(this.anim.handle);
    this.anim = null;
  }
}
