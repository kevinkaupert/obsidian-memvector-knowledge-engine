import { Notice, type App } from "obsidian";
import { getApiKeyFor } from "../../settings/apiKeyMigration";
import type { MemVectorSettings } from "../../settings/types";
import { callDirectLLM } from "../../llm/callDirectLLM";
import { getTranslation } from "../../i18n";
import { toSlug } from "../../noteSlug";
import { SynthesisResultModal } from "../../modals/SynthesisResultModal";
import { enrichContext, type EnrichedNote } from "./contextEnrichment";
import { loadAgentsGuidelines } from "./agentsGuidelines";
import type { ScatterNode } from "./types";

function buildEnrichedSection(enriched: EnrichedNote[], lang: string): { block: string; linkLines: string } {
  if (enriched.length === 0) return { block: "", linkLines: "" };

  const heading =
    lang === "de"
      ? "Automatisch gefundene, thematisch/strukturell verwandte Notizen (NICHT vom Nutzer ausgewählt - nur Hintergrundkontext, per Vektor-Ähnlichkeit in Qdrant und/oder Graph-Nachbarschaft in Memgraph gefunden; Fokus bleibt auf den oben ausgewählten Notizen):"
      : "Automatically found, topically/structurally related notes (NOT selected by the user - background context only, found via Qdrant vector similarity and/or Memgraph graph neighborhood; the focus stays on the notes selected above):";

  const block = `\n${heading}\n${enriched
    .map((n) => `- [${n.sources.join("+")}] "${n.title}": ${n.content.slice(0, 300)}`)
    .join("\n")}\n`;

  const linkLines = enriched.map((n) => `- Notiz: "${n.title}" -> Obsidian WikiLink: [[${n.id}|${n.title}]]`).join("\n");
  return { block, linkLines };
}

function buildPrompt(
  selected: ScatterNode[],
  isMath: boolean,
  lang: string,
  promptLang: string,
  customQuestion?: string,
  enriched: EnrichedNote[] = []
): string {
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

  const { block: enrichedBlock, linkLines: enrichedLinkLines } = buildEnrichedSection(enriched, lang);
  const notesListStr = [selected.map((n) => `- ${noteLabel}: "${n.title}" -> Obsidian WikiLink: [[${n.id}|${n.title}]]`).join("\n"), enrichedLinkLines]
    .filter(Boolean)
    .join("\n");

  const trimmedQuestion = customQuestion?.trim();
  if (trimmedQuestion) {
    return lang === "de"
      ? `Du bist ein führender ${isMath ? "mathematischer Tutor" : "Wissens-Synthesizer"} und KI-Co-Pilot für ein Obsidian Knowledge-Wiki.
Der Benutzer hat folgende ${selected.length} Notizen im 2D-Vektorraum selektiert:

${notesSummary}
${enrichedBlock}
Verfügbare Notiz-WikiLinks:
${notesListStr}

Beantworte präzise ${promptLang} die folgende Frage des Nutzers zu diesen ${selected.length} Notizen:
"${trimmedQuestion}"

STRIKTE VORGABE FÜR FORMATIERUNG UND VERLINKUNGEN:
1. WICHTIGE WIKILINK-REGEL: Verwende FÜR JEDEN Fachbegriff, Notiz-Titel, Satz oder Begriff AUSNAHMSLOS Obsidian WikiLinks im Format [[dateistem|Angezeigter Begriff]] STATT bloßer Fettschrift (**...**)!
2. VERBOT: Verwende KEINE bloße Fettschrift (**Begriff**) für Fachbegriffe oder Notiznamen. Ersetze Fettschrift durch echte Obsidian WikiLinks [[...]].`
      : `You are a leading ${isMath ? "mathematical tutor" : "knowledge synthesizer"} and AI co-pilot for an Obsidian knowledge wiki.
The user has selected the following ${selected.length} notes in the 2D vector space:

${notesSummary}
${enrichedBlock}
Available note WikiLinks:
${notesListStr}

Answer precisely ${promptLang} the user's following question about these ${selected.length} notes:
"${trimmedQuestion}"

STRICT FORMATTING AND LINKING RULES:
1. IMPORTANT WIKILINK RULE: Use Obsidian WikiLinks in the format [[file-stem|Display Name]] for EVERY technical term, note title, theorem, or concept INSTEAD of bold text (**...**)!
2. PROHIBITION: Do NOT use bold text (**term**) for technical terms or note names. Replace bold with real Obsidian WikiLinks [[...]].`;
  }

  if (isMath) {
    return lang === "de"
      ? `Du bist ein führender mathematischer Tutor und KI-Co-Pilot für ein Obsidian Studium-Wiki.
Der Benutzer hat folgende ${selected.length} mathematische Notizen im 2D-Vektorraum selektiert:

${notesSummary}
${enrichedBlock}
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
${enrichedBlock}
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
${enrichedBlock}
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
${enrichedBlock}
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
  setHoverText: (text: string) => void,
  customQuestion?: string
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

  let enriched: EnrichedNote[] = [];
  if (settings.enrichSynthesisContext) {
    setHoverText("🔎 Suche verwandten Kontext (Qdrant + Memgraph)...");
    enriched = await enrichContext(app, settings, selected);
  }

  setHoverText(`${modelName} ...`);

  let prompt = buildPrompt(selected, settings.knowledgeDomain === "math", lang, t.llmPromptLang, customQuestion, enriched);

  if (settings.includeAgentsGuidelines) {
    const guidelines = await loadAgentsGuidelines(app, settings);
    if (guidelines) {
      const header =
        lang === "de"
          ? `Befolge bei deiner Antwort zusätzlich strikt die folgenden projektinternen Wissens-Kompilierungsregeln dieses Vaults, soweit sie auf eine Textantwort anwendbar sind (ignoriere Anweisungen zu Skripten/Dateioperationen, die du nicht ausführen kannst):\n\n${guidelines}\n\n---\n\n`
          : `Additionally, strictly follow this vault's own knowledge-compilation house rules below, wherever applicable to a text answer (ignore instructions about scripts/file operations you cannot execute):\n\n${guidelines}\n\n---\n\n`;
      prompt = header + prompt;
    }
  }

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
