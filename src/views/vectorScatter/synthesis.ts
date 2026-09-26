import { Notice, TFile, type App } from "obsidian";
import { resolveApiKeyFor } from "../../settings/secrets";
import type { MemVectorSettings } from "../../settings/types";
import { callDirectLLM } from "../../llm/callDirectLLM";
import { getTranslation } from "../../i18n";
import { capText, stripFrontmatter } from "../../noteContent";
import { toSlug } from "../../noteSlug";
import { SynthesisResultModal } from "../../modals/SynthesisResultModal";
import { enrichContext, type EnrichedNote } from "./contextEnrichment";
import { loadAgentsGuidelines } from "./agentsGuidelines";
import type { ScatterNode } from "./types";

function buildEnrichedSection(enriched: EnrichedNote[], lang: string, contentCapChars: number): { block: string; linkLines: string } {
  if (enriched.length === 0) return { block: "", linkLines: "" };

  const heading =
    lang === "de"
      ? "Automatisch per GraphRAG gefundene, verwandte Notizen (NICHT vom Nutzer ausgewählt - nur Hintergrundkontext aus semantischer Vektor-Ähnlichkeit und Multi-Hop-Graph-Beziehungen; der Fokus bleibt auf den oben ausgewählten Notizen):"
      : "Automatically found related notes via GraphRAG (NOT selected by the user - background context only, retrieved via semantic vector similarity and multi-hop graph relationships; focus stays on the notes selected above):";

  // enrichContext() already applied contentCapChars when it read each neighbor's
  // content (contextEnrichment.ts) - capping again here would silently override
  // that with a different, hardcoded number (the actual F07 bug), so this only
  // re-applies the same configured cap, never a second/different one.
  const block = `\n${heading}\n${enriched
    .map((n) => `- [${n.sources.join("+")}] "${n.title}": ${capText(n.content, contentCapChars)}`)
    .join("\n")}\n`;

  const linkLines = enriched
    .map((n) => `- ${lang === "de" ? "Notiz" : "Note"}: "${n.title}" -> Obsidian WikiLink: [[${n.id}|${n.title}]]`)
    .join("\n");
  return { block, linkLines };
}

import { detectModelTier } from "../../llm/modelTiers";

interface SynthesisNoteContent extends ScatterNode {
  /** Full current note body, freshly re-read from the vault - never the scanner's fixed-size canvas preview (vaultScan.ts caps that at 800 chars for layout/similarity purposes unrelated to synthesis quality). */
  fullContent: string;
}

function buildPrompt(
  selected: SynthesisNoteContent[],
  isMath: boolean,
  lang: string,
  promptLang: string,
  contentCapChars: number,
  customQuestion?: string,
  enriched: EnrichedNote[] = [],
  isFrontier = false
): string {
  const noteLabel = lang === "de" ? "Notiz" : "Note";
  const pathLabel = lang === "de" ? "Pfad" : "Path";
  const excerptLabel = lang === "de" ? "Auszug" : "Excerpt";

  const notesSummary = selected
    .map(
      (n, idx) => `### ${noteLabel} ${idx + 1}: ${n.title} (${n.type})
${pathLabel}: ${n.path}
${n.latexFormulas && n.latexFormulas.length > 0 ? `Formeln: ${n.latexFormulas.slice(0, isFrontier ? 10 : 3).map((f) => `$${f}$`).join(", ")}\n` : ""}${excerptLabel}:
${capText(n.fullContent, contentCapChars)}`
    )
    .join("\n\n");

  const { block: enrichedBlock } = buildEnrichedSection(enriched, lang, contentCapChars);
  const trimmedQuestion = customQuestion?.trim();

  if (trimmedQuestion) {
    return lang === "de"
      ? `Du bist ein erfahrener KI-Assistent für Wissenssynthese in Obsidian.
Analysiere folgende ${selected.length} ausgewählte Notizen aus dem Vault:

${notesSummary}${enrichedBlock}

Aufgabe: Beantworte präzise auf Deutsch die folgende Frage zu diesen Notizen:
"${trimmedQuestion}"

Richtlinien:
- Strukturiere die Antwort klar und verständlich.
- Verknüpfe zentrale Fachbegriffe und Notiztitel mit Obsidian WikiLinks: [[Notizname]].`
      : `You are an expert AI knowledge synthesis assistant for Obsidian.
Analyze the following ${selected.length} selected notes from the vault:

${notesSummary}${enrichedBlock}

Task: Answer precisely in English the following question about these notes:
"${trimmedQuestion}"

Guidelines:
- Structure the response clearly and concisely.
- Link core concepts and note titles using Obsidian WikiLinks: [[Note Name]].`;
  }

  if (isMath) {
    return lang === "de"
      ? `Du bist ein mathematischer Tutor für ein Obsidian Knowledge-Wiki.
Analysiere den Zusammenhang zwischen folgenden ${selected.length} mathematischen Notizen:

${notesSummary}${enrichedBlock}

Aufgabe: Erstelle eine ${isFrontier ? "tiefgehende, mathematisch präzise" : "fundierte"} mathematische Synthese auf Deutsch:
1. **Kernzusammenhang & Intuition**: Welcher rote Faden und welche mathematische Idee verbindet diese Notizen?
2. **Formale ${isFrontier ? "& Beweis-" : ""}Brücke**: Welche Definitionen, Voraussetzungen oder Sätze bauen aufeinander auf?${isFrontier ? " Wie greifen die Voraussetzungen ineinander?" : ""}
3. **Didaktische Quintessenz**: Was ist die wichtigste Erkenntnis aus dieser Verknüpfung?

Richtlinien:
- Formuliere präzise, verständlich und mathematisch sauber.
- Verwende für Fachbegriffe und Notiznamen Obsidian-WikiLinks im Format [[Begriffsname]].
- Formeln sauber in LaTeX ($...$ oder $$...$$) setzen.`
      : `You are a mathematical tutor for an Obsidian knowledge wiki.
Analyze the relationship between the following ${selected.length} mathematical notes:

${notesSummary}${enrichedBlock}

Task: Create a ${isFrontier ? "deep, mathematically rigorous" : "structured"} mathematical synthesis in English:
1. **Core Intuition & Connection**: What common thread connects these notes?
2. **Formal ${isFrontier ? "& Proof " : ""}Bridge**: Which definitions, preconditions, or theorems build on each other?
3. **Takeaway**: What is the key insight from this connection?

Guidelines:
- Be precise, clear, and mathematically rigorous.
- Link key terms and note names with Obsidian WikiLinks [[Concept Name]].
- Format formulas cleanly in LaTeX ($...$ or $$...$$).`;
  }

  return lang === "de"
    ? `Du bist ein erfahrener KI-Assistent für Wissenssynthese in Obsidian.
Analysiere den Zusammenhang zwischen folgenden ${selected.length} Notizen:

${notesSummary}${enrichedBlock}

Aufgabe: Erstelle eine strukturierte Wissenssynthese auf Deutsch:
1. **Kernzusammenhang**: Welcher übergeordnete Gedanke verbindet diese Notizen?
2. **Querverbindungen**: Wie ergänzen sich die behandelten Aspekte oder bauen aufeinander auf?
3. **Fazit / Synergie**: Welche neue Erkenntnis ergibt sich aus der gemeinsamen Betrachtung?

Richtlinien:
- Strukturiere die Antwort mit klaren Abschnitten.
- Verknüpfe zentrale Begriffe mit Obsidian WikiLinks [[Begriffsname]].`
    : `You are an expert AI knowledge synthesis assistant for Obsidian.
Analyze the relationship between the following ${selected.length} notes:

${notesSummary}${enrichedBlock}

Task: Create a structured knowledge synthesis in English:
1. **Core Connection**: What overarching idea connects these notes?
2. **Cross-Links**: How do these concepts complement or build on each other?
3. **Takeaway / Synergy**: What new insight arises from viewing them together?

Guidelines:
- Structure the response with clear headings.
- Link key concepts with Obsidian WikiLinks [[Concept Name]].`;
}

function buildVaultTitleMap(app: App): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const basename = file.basename;
    map.set(toSlug(basename), basename);
    map.set(basename.toLowerCase(), basename);

    const cache = app.metadataCache.getFileCache(file);
    const aliases: unknown = cache?.frontmatter?.aliases;
    if (aliases) {
      const list: unknown[] = Array.isArray(aliases) ? aliases : [aliases];
      list.forEach((al) => map.set(String(al).toLowerCase(), basename));
    }
  }
  return map;
}

function formatThinkingBlocks(raw: string): string {
  if (!raw.includes("<think>")) return raw;
  return raw.replace(/<think>([\s\S]*?)<\/think>/g, (_, thinking: string) => {
    const cleanThinking = thinking.trim();
    if (!cleanThinking) return "";
    return `\n> [!note]- Gedankengang des Modells\n> ${cleanThinking.replace(/\n/g, "\n> ")}\n\n`;
  });
}

const STRUCTURAL_KEYWORDS = new Set([
  "definition", "satz", "theorem", "lemma", "korollar", "corollary", "proposition",
  "beweis", "proof", "beweisidee", "beweisschritt", "schritt", "step", "hinweis", "note", "anmerkung", "remark",
  "kernzusammenhang", "intuition", "querverbindungen", "fazit", "takeaway", "synergie",
  "didaktische quintessenz", "formale brücke", "zusammenfassung", "summary", "beispiel", "example",
  "voraussetzung", "voraussetzungen", "precondition", "preconditions", "wichtig", "important", "ziel", "ausgangspunkt"
]);

function isStructuralMarker(term: string): boolean {
  const trimmed = term.trim();
  if (trimmed.endsWith(":") || trimmed.startsWith("#")) return true;
  if (/^\d+[.)]\s*/.test(trimmed)) return true;
  const lower = trimmed.toLowerCase().replace(/[:\d._-]/g, "").trim();
  if (STRUCTURAL_KEYWORDS.has(lower)) return true;
  return false;
}

function linkifySynthesis(raw: string, vaultTitleMap: Map<string, string>, lang = "de"): string {
  const cleaned = formatThinkingBlocks(raw);
  const prospectiveTerms = new Set<string>();
  let text = cleaned.replace(/\*\*([^*]+)\*\*/g, (match, term: string) => {
    const cleanTerm = term.trim();
    if (cleanTerm.length <= 2 || cleanTerm.includes("\n") || isStructuralMarker(cleanTerm)) {
      return match;
    }

    const slug = toSlug(cleanTerm);
    const existingBasename = vaultTitleMap.get(slug) || vaultTitleMap.get(cleanTerm.toLowerCase());
    if (existingBasename) return `[[${existingBasename}|${cleanTerm}]]`;

    // Only suggest clean concept names as knowledge gaps (letters/numbers/hyphens only)
    if (/^[a-zA-Z0-9äöüÄÖÜß\s-]+$/.test(cleanTerm) && cleanTerm.length >= 3 && cleanTerm.length <= 60) {
      prospectiveTerms.add(cleanTerm);
    }
    return match;
  });

  if (prospectiveTerms.size > 0) {
    const heading =
      lang === "de"
        ? "\n\n### [Vorschlag] Neue Notizen (Wissenslücken)\n"
        : "\n\n### [Suggestion] New Notes (Knowledge Gaps)\n";
    const noteHint =
      lang === "de"
        ? "*(Notiz noch nicht im Vault vorhanden)*"
        : "*(Note does not yet exist in vault)*";
    text += heading;
    prospectiveTerms.forEach((term) => {
      text += `- [[${toSlug(term)}|${term}]] ${noteHint}\n`;
    });
  }
  return text;
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
  const apiKey = resolveApiKeyFor(app, settings, settings.llmProvider);
  const temperature = settings.temperature ?? 0.1;
  const lang = settings.language || "de";
  const t = getTranslation(lang);
  const tier = detectModelTier(modelName, settings.llmProvider);
  const isFrontier = tier === "frontier";
  const contentCapChars = settings.synthesisContentCapChars ?? 0;

  // Re-read each selected note's current full body - vaultScan.ts's ScatterNode.content
  // is a fixed 800-char canvas preview for layout/similarity, not a synthesis source.
  const selectedWithFullContent = await Promise.all(
    selected.map(async (n) => {
      const file = app.vault.getAbstractFileByPath(n.path);
      const fullContent = file instanceof TFile ? stripFrontmatter(await app.vault.cachedRead(file)) : n.content;
      return { ...n, fullContent };
    })
  );

  let enriched: EnrichedNote[] = [];
  if (settings.enrichSynthesisContext) {
    const hopDepth = settings.synthesisHopDepth ?? 2;
    setHoverText(`[INFO] Suche verwandten Kontext (${tier}, ${hopDepth} ${hopDepth === 1 ? "Hop" : "Hops"})...`);
    enriched = await enrichContext(app, settings, selected, contentCapChars, hopDepth);
  }

  setHoverText(`${modelName} (${tier.toUpperCase()}) ...`);

  let prompt = buildPrompt(selectedWithFullContent, settings.knowledgeDomain === "math", lang, t.llmPromptLang, contentCapChars, customQuestion, enriched, isFrontier);

  if (settings.includeAgentsGuidelines) {
    const guidelines = await loadAgentsGuidelines(app, settings, settings.agentsGuidelinesCharCap ?? 0);
    if (guidelines) {
      const header =
        lang === "de"
          ? `Befolge bei deiner Antwort zusätzlich die folgenden projektinternen Wissens-Kompilierungsregeln dieses Vaults, soweit sie auf eine Textantwort anwendbar sind:\n\n${guidelines}\n\n---\n\n`
          : `Additionally, strictly follow this vault's own knowledge-compilation house rules below, wherever applicable to a text answer:\n\n${guidelines}\n\n---\n\n`;
      prompt = header + prompt;
    }
  }

  let rawSynthesisText: string;
  try {
    rawSynthesisText = await callDirectLLM(prompt, apiBase, apiKey, modelName, temperature, t.llmSystemPrompt, settings.llmProvider);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setHoverText(`[ERROR] ${msg.slice(0, 70)}`);
    new Notice(`[ERROR] ${t.llmErrorPrefix} ${msg}`, 10000);
    return;
  }

  const vaultTitleMap = buildVaultTitleMap(app);
  const synthesisText = linkifySynthesis(rawSynthesisText, vaultTitleMap, lang);

  new SynthesisResultModal(app, selected, synthesisText, modelName, settings).open();
  setHoverText(`${modelName} ${t.synthCompletePrefix} ${selected.length} ${t.synthCompleteSuffix}`);
}
