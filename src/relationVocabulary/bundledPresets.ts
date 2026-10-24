import type { RelationTermDef } from "./types";
import LAW from "./knowos-contract/presets/law.json";
import MEDICINE from "./knowos-contract/presets/medicine.json";
import PHILOSOPHY from "./knowos-contract/presets/philosophy.json";

/**
 * Bundled relation-type presets beyond the STEM default (defaultVocabulary.ts).
 * Stubs are intentionally small starting points - users extend them through the
 * Settings Relation Type Manager or by editing the preset file directly.
 * Architecture: unchanged copies of the knowOS contract presets in
 * `knowos-contract/presets/` (knowOS ADR-0011 amendment, #125), checked by knowOS.
 */
export const LAW_VOCABULARY: RelationTermDef[] = LAW.terms as RelationTermDef[];

export const MEDICINE_VOCABULARY: RelationTermDef[] = MEDICINE.terms as RelationTermDef[];

export const PHILOSOPHY_VOCABULARY: RelationTermDef[] = PHILOSOPHY.terms as RelationTermDef[];
