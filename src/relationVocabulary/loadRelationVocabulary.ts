import { Notice, TFile, type App } from "obsidian";
import { ensureParentFolder } from "../ensureFolder";
import type { MemVectorSettings } from "../settings/types";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import type { RelationTermDef, RelationVocabularyFile } from "./types";

export const DEFAULT_RELATION_VOCABULARY_PATH = "wiki/relation-types.json";

function isValidTerm(v: unknown): v is RelationTermDef {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.key === "string" &&
    typeof t.label === "string" &&
    typeof t.term === "string" &&
    typeof t.category === "string" &&
    typeof t.bidirectional === "boolean" &&
    typeof t.reversed === "boolean"
  );
}

/**
 * Loads the vault's own relation-type vocabulary (settings.relationVocabularyPath,
 * default wiki/relation-types.json). If the file doesn't exist yet, seeds it with
 * the bundled STEM default and returns that - so a fresh vault behaves exactly
 * like before, but the file is now there to edit for any other domain. Malformed
 * files fall back to the bundled default with a Notice rather than breaking the
 * relation builder.
 */
export async function loadRelationVocabulary(app: App, settings: Pick<MemVectorSettings, "relationVocabularyPath">): Promise<RelationTermDef[]> {
  const path = (settings.relationVocabularyPath || DEFAULT_RELATION_VOCABULARY_PATH).trim() || DEFAULT_RELATION_VOCABULARY_PATH;
  const existing = app.vault.getAbstractFileByPath(path);

  if (!(existing instanceof TFile)) {
    try {
      await ensureParentFolder(app, path);
      const seed: RelationVocabularyFile = { terms: DEFAULT_RELATION_VOCABULARY };
      await app.vault.create(path, JSON.stringify(seed, null, 2));
    } catch {
      // Vault may already have the file (race) or be read-only - fall through and use the in-memory default either way.
    }
    return DEFAULT_RELATION_VOCABULARY;
  }

  try {
    const raw = await app.vault.read(existing);
    const parsed = JSON.parse(raw) as Partial<RelationVocabularyFile>;
    const terms = Array.isArray(parsed.terms) ? parsed.terms.filter(isValidTerm) : [];
    if (terms.length === 0) throw new Error("no valid terms");
    return terms;
  } catch (err) {
    new Notice(`⚠️ ${path} konnte nicht gelesen werden (${err instanceof Error ? err.message : String(err)}) - verwende Standard-Vokabular.`);
    return DEFAULT_RELATION_VOCABULARY;
  }
}
