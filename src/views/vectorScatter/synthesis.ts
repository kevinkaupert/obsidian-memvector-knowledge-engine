import { Notice, type App } from "obsidian";
import { getApiKeyFor } from "../../settings/apiKeyMigration";
import type { MemVectorSettings } from "../../settings/types";
import { callDirectLLM } from "../../llm/callDirectLLM";
import { getTranslation } from "../../i18n";
import { toSlug } from "../../noteSlug";
import { SynthesisResultModal } from "../../modals/SynthesisResultModal";
import type { ScatterNode } from "./types";

function buildPrompt(selected: ScatterNode[], isMath: boolean, lang: string, promptLang: string): string {
  const noteLabel = lang === "de" ? "Notiz" : "Note";
  const pathLabel = lang === "de" ? "Pfad" : "Path";
  const formulasLabel = lang === "de" ? "Formeln" : "Formulas";
  const excerptLabel = lang === "de" ? "Auszug" : "Excerpt";

  const notesSummary = selected
    .map(
      (n, idx) => `
### ${noteLabel} ${idx + 1}: [${n.type.toUpperCase()}] ${n.title}
${pathLabel}: ${n.path}
${formulasLabel}: ${n.latexFormulas.map((f) => `$${f}$`).join(", ")}
${excerptLabel}:
${n.content}
`
    )
    .join("\n---\n");

  const notesListStr = selected.map((n) => `- ${noteLabel}: "${n.title}" -> Obsidian WikiLink: [[${n.id}|${n.title}]]`).join("\n");

  if (isMath) {
    return lang === "de"
      ? `Du bist ein führender mathematischer Tutor und KI-Co-Pilot für ein Obsidian Studium-Wiki.
Der Benutzer hat folgende ${selected.length} mathematische Notizen im 2D-Vektorraum selektiert:

${notesSummary}

Verfügbare Notiz-WikiLinks:
${notesListStr}

STRIKTE VORGABE FÜR FORMATIERUNG UND VERLINKUNGEN:
1. Erläutere präzise ${promptLang} den mathematischen Zusammenhang, die Brücke und den roten Faden zwischen diesen ${selected.length} Notizen.
2. Zeige, wie sie sich gegenseitig ergänzen, wo Vorbedingungen/Beweisschritte vorliegen und welche mathematische Identität oder Struktur sie verbindet.
3. WICHTIGE WIKILINK-REGEL: Verwende FÜR JEDEN Fachbegriff, Notiz-Titel, Satz, Beweistrick oder Begriff AUSNAHMSLOS Obsidian WikiLinks im Format [[dateistem|Angezeigter Begriff]] (wie z. B. [[disjunktion|Disjunktion]], [[gauss-summenformel|Gaußsche Summenformel]]) STATT bloßer Fettschrift (**...**)!
4. VERBOT: Verwende KEINE bloße Fettschrift (**Begriff**) für mathematische Begriffe oder Notiznamen. Ersetze Fettschrift durch echte Obsidian WikiLinks [[...]].`
      : `You are a leading mathematical tutor and AI co-pilot for an Obsidian study wiki.
The user has selected the following ${selected.length} mathematical notes in the 2D vector space:

${notesSummary}

Available note WikiLinks:
${notesListStr}

STRICT FORMATTING AND LINKING RULES:
1. Explain precisely ${promptLang} the mathematical relationship, bridge, and common thread between these ${selected.length} notes.
2. Show how they complement each other, where preconditions/proof steps exist, and what mathematical identity or structure connects them.
3. IMPORTANT WIKILINK RULE: Use Obsidian WikiLinks in the format [[file-stem|Display Name]] for EVERY technical term, note title, theorem, proof technique, or concept INSTEAD of bold text (**...**)!
4. PROHIBITION: Do NOT use bold text (**term**) for mathematical terms or note names. Replace bold with real Obsidian WikiLinks [[...]].`;
  }

  return lang === "de"
    ? `Du bist ein führender Wissens-Synthesizer und KI-Co-Pilot für Obsidian Knowledge Vaults.
Der Benutzer hat folgende ${selected.length} Notizen im 2D-Vektorraum selektiert:

${notesSummary}

Verfügbare Notiz-WikiLinks:
${notesListStr}

STRIKTE VORGABE FÜR FORMATIERUNG UND VERLINKUNGEN:
1. Erläutere präzise ${promptLang} den inhaltlichen Zusammenhang, die Kerngedanken und den roten Faden zwischen diesen ${selected.length} Notizen.
2. Zeige, wie die Konzepte aufeinander aufbauen, sich ergänzen oder verschiedene Blickwinkel einnehmen.
3. WICHTIGE WIKILINK-REGEL: Verwende FÜR JEDEN Fachbegriff, Notiz-Titel, Konzept oder Schlüsselbegriff AUSNAHMSLOS Obsidian WikiLinks im Format [[dateistem|Angezeigter Begriff]] STATT bloßer Fettschrift (**...**)!
4. VERBOT: Verwende KEINE bloße Fettschrift (**Begriff**) für Fachbegriffe. Ersetze Fettschrift durch echte Obsidian WikiLinks [[...]].`
    : `You are a leading knowledge synthesizer and AI co-pilot for Obsidian Knowledge Vaults.
The user has selected the following ${selected.length} notes in the 2D vector space:

${notesSummary}

Available note WikiLinks:
${notesListStr}

STRICT FORMATTING AND LINKING RULES:
1. Explain precisely ${promptLang} the content relationship, core ideas, and common thread between these ${selected.length} notes.
2. Show how the concepts build on each other, complement each other, or offer different perspectives.
3. IMPORTANT WIKILINK RULE: Use Obsidian WikiLinks in the format [[file-stem|Display Name]] for EVERY technical term, note title, concept, or key term INSTEAD of bold text (**...**)!
4. PROHIBITION: Do NOT use bold text (**term**) for technical terms. Replace bold with real Obsidian WikiLinks [[...]].`;
}

function buildVaultTitleMap(app: App): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const basename = file.basename;
    map.set(toSlug(basename), basename);
    map.set(basename.toLowerCase(), basename);

    const cache = app.metadataCache.getFileCache(file);
    const aliases = cache?.frontmatter?.aliases;
    if (aliases) {
      const list: unknown[] = Array.isArray(aliases) ? aliases : [aliases];
      list.forEach((al) => map.set(String(al).toLowerCase(), basename));
    }
  }
  return map;
}

function linkifySynthesis(raw: string, linkMode: string, vaultTitleMap: Map<string, string>): string {
  if (linkMode === "existing_only" || linkMode === "suggested_section") {
    const prospectiveTerms = new Set<string>();
    let text = raw.replace(/\*\*([^*]+)\*\*/g, (match, term: string) => {
      const cleanTerm = term.trim();
      if (cleanTerm.length <= 2 || cleanTerm.includes("\n") || cleanTerm.startsWith("#")) return match;

      const slug = toSlug(cleanTerm);
      const existingBasename = vaultTitleMap.get(slug) || vaultTitleMap.get(cleanTerm.toLowerCase());
      if (existingBasename) return `[[${existingBasename}|${cleanTerm}]]`;

      prospectiveTerms.add(cleanTerm);
      return cleanTerm;
    });

    if (linkMode === "suggested_section" && prospectiveTerms.size > 0) {
      text += "\n\n### 💡 Vorgeschlagene neue Notizen (Wissenslücken)\n";
      prospectiveTerms.forEach((term) => {
        text += `- [[${toSlug(term)}|${term}]] *(Notiz noch nicht im Vault vorhanden)*\n`;
      });
    }
    return text;
  }

  // "all_concepts": convert every **Term** into [[slug|Term]]
  return raw.replace(/\*\*([^*]+)\*\*/g, (match, term: string) => {
    const cleanTerm = term.trim();
    if (cleanTerm.length > 2 && !cleanTerm.includes("\n") && !cleanTerm.startsWith("#")) {
      const slug = toSlug(cleanTerm);
      if (slug) return `[[${slug}|${cleanTerm}]]`;
    }
    return match;
  });
}

export async function runSynthesis(
  app: App,
  settings: MemVectorSettings,
  selected: ScatterNode[],
  setHoverText: (text: string) => void
): Promise<void> {
  if (selected.length === 0) return;

  const modelName = settings.modelName || "LLM";
  const apiBase = settings.apiBaseUrl || "http://localhost:11434/v1";
  // Bugfix #3 follow-through: was reading the legacy shared `deepseekApiKey`
  // field directly; now reads the current provider's own key.
  const apiKey = getApiKeyFor(settings, settings.llmProvider) || "ollama";
  const temperature = settings.temperature ?? 0.1;
  const lang = settings.language || "de";
  const t = getTranslation(lang);

  setHoverText(`${modelName} ...`);

  const prompt = buildPrompt(selected, settings.knowledgeDomain === "math", lang, t.llmPromptLang);

  let rawSynthesisText: string;
  try {
    rawSynthesisText = await callDirectLLM(prompt, apiBase, apiKey, modelName, temperature, t.llmSystemPrompt);
  } catch (err) {
    setHoverText("❌ Synthese fehlgeschlagen");
    new Notice(`❌ MemVector LLM-Fehler: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const vaultTitleMap = buildVaultTitleMap(app);
  const linkMode = settings.synthesisLinkMode || "suggested_section";
  const synthesisText = linkifySynthesis(rawSynthesisText, linkMode, vaultTitleMap);

  new SynthesisResultModal(app, selected, synthesisText, modelName, settings).open();
  setHoverText(`${modelName} Synthese für ${selected.length} Notizen abgeschlossen.`);
}
