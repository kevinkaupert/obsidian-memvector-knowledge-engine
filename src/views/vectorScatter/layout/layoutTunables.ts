/**
 * Tunables of the 2D layout's update behavior (ADR-0006). Distances are in canvas units, the unit node positions are
 * stored in (node spacing defaults to 350).
 */

/** A node counts as moved, and its position is written, only when it moved further than this since the last write. */
export const POSITION_WRITE_TOLERANCE = 0.5;

/** Quiet period before moved positions are written, so a burst of layout passes results in one database write (ms). */
export const POSITION_WRITE_DELAY_MS = 1000;
