import type { RelationTermDef } from "./types";
import STEM from "./knowos-contract/presets/stem.json";

/**
 * The plugin's bundled STEM vocabulary: exactly one entry per canonical Cypher
 * label (17 total). Per-label layout semantics (weight/repels, ADR-0002) live
 * here as the single source of truth for the defaults. Vaults seed
 * wiki/relation-types.json from this list on first use and can extend or
 * replace it freely.
 * Architecture: read from an unchanged copy of the knowOS contract preset
 * `docs/contracts/presets/stem.json` (knowOS ADR-0011 amendment, #125); knowOS
 * checks the copy byte for byte, so MemVector, Canvas Tutor and Jovian share one
 * default without hand-kept tables.
 */
export const DEFAULT_RELATION_VOCABULARY: RelationTermDef[] = STEM.terms as RelationTermDef[];
