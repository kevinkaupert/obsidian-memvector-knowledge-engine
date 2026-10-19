/**
 * Tunables of the 2D layout's update behavior (ADR-0006). Distances are in canvas units, the unit node positions are
 * stored in (node spacing defaults to 350).
 */

/** A node counts as moved, and its position is written, only when it moved further than this since the last write. */
export const POSITION_WRITE_TOLERANCE = 0.5;

/** Quiet period before moved positions are written, so a burst of layout passes results in one database write (ms). */
export const POSITION_WRITE_DELAY_MS = 1000;

/**
 * Starting annealing energy of a bounded adjustment (a free pass starts at 0.5). Low, so an already settled layout is
 * nudged instead of re-heated.
 */
export const BOUNDED_START_ALPHA = 0.15;

/** A bounded adjustment stops once no mobile node moves further than this in one iteration (canvas units). */
export const BOUNDED_STOP_MOVEMENT = 0.5;

/**
 * Strength of the pull that keeps an existing mobile node near its previous position during a bounded adjustment,
 * as force per canvas unit of displacement. Relation and similarity forces are in the tens to hundreds.
 */
export const ANCHOR_STIFFNESS = 0.08;

/**
 * Hard bound per bounded adjustment (Plan 0005 S3): a note that moves only because a nearby note changed ends at most
 * this share of node spacing away from where it was before the pass. Changed and new notes are not bounded.
 */
export const NEIGHBOR_MOVE_LIMIT = 0.15;

/** Per changed node, this many of its most similar nodes may move along in a bounded adjustment. */
export const SIMILAR_NEIGHBORS_MOBILE = 5;

/**
 * Share of nodes whose own layout inputs may change at once before an automatic update falls back to a free global
 * pass instead of a bounded adjustment, e.g. after vectors were calculated for most notes.
 */
export const LARGE_CHANGE_RATIO = 0.5;

/** Range of the node spacing slider (canvas units). */
export const NODE_SPACING_RANGE = { min: 120, max: 1600, step: 20 };

/** Range of the cluster spacing slider (canvas units). */
export const CLOUD_SPACING_RANGE = { min: 300, max: 3000, step: 50 };

/** Purpose: Limits a node spacing value to the slider range. */
export function clampNodeSpacing(value: number): number {
  return Math.max(NODE_SPACING_RANGE.min, Math.min(NODE_SPACING_RANGE.max, value));
}

/** Purpose: Limits a cluster spacing value to the slider range. */
export function clampCloudSpacing(value: number): number {
  return Math.max(CLOUD_SPACING_RANGE.min, Math.min(CLOUD_SPACING_RANGE.max, value));
}

/**
 * Upper bound on how far a relation weight may shorten a pair's target distance and stiffen its spring (a factor,
 * unitless). Weights above it behave like this value; the relation type settings warn when one is entered.
 */
export const MAX_RELATION_WEIGHT_FACTOR = 6;

/**
 * Extra free passes after a layout built from scratch ("Layout neu anordnen", first layout without stored positions):
 * one pass cannot travel from the initial spread to a settled layout when node spacing is small, because the per-step
 * movement is capped by node spacing. Best effort, not guaranteed convergence (ADR-0006).
 */
export const SETTLE_MAX_PASSES = 6;
/** Work budget of the extra passes in node pairs per pass: floor(budget / n^2) passes at most, so large vaults stay fast. */
export const SETTLE_PAIR_BUDGET = 250_000;
/** The extra passes stop once no node moved further than this share of node spacing in one pass. */
export const SETTLE_STOP_RATIO = 0.05;
