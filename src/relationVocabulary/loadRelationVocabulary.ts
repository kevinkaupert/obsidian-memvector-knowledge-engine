import { Notice, TFile, type App } from "obsidian";
import { ensureParentFolder } from "../ensureFolder";
import type { MemVectorSettings } from "../settings/types";
import { DEFAULT_RELATION_VOCABULARY } from "./defaultVocabulary";
import { withBundledLayoutDefaults } from "./layoutDefaults";
import type { RelationTermDef, RelationVocabularyFile } from "./types";
import { getTranslation } from "../i18n";

export const DEFAULT_RELATION_VOCABULARY_PATH = "wiki/relation-types.json";

export function isValidTerm(v: unknown): v is RelationTermDef {
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
 * Purpose: Loads the vault's relation-type vocabulary, preserving an intentional empty preset and falling back to STEM on corrupt files (Issues #139, #149).
 * Architecture: If the file doesn't exist yet, seeds it with the bundled STEM default and returns that. Malformed or unparseable files fall back to the bundled default with a Notice rather than breaking the relation builder, while an intentional empty vocabulary ({ terms: [] }) is preserved. Terms missing layout fields inherit bundled layout defaults (ADR-0002).
 */
export async function loadRelationVocabulary(
  app: App,
  settings: Partial<Pick<MemVectorSettings, "relationVocabularyPath" | "language">> = {}
): Promise<RelationTermDef[]> {
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
    const raw = await app.vault.cachedRead(existing);
    const parsed = JSON.parse(raw) as Partial<RelationVocabularyFile>;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.terms)) {
      throw new Error("missing terms array");
    }
    const terms = parsed.terms.filter(isValidTerm);
    if (parsed.terms.length > 0 && terms.length === 0) {
      throw new Error("no valid terms");
    }
    return withBundledLayoutDefaults(terms);
  } catch (err) {
    const t = getTranslation(settings.language || "de");
    new Notice(`[WARN] ${path} ${t.relVocabLoadWarn} (${err instanceof Error ? err.message : String(err)})`);
    return DEFAULT_RELATION_VOCABULARY;
  }
}
