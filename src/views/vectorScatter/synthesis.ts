import { Notice, TFile, type App } from "obsidian";
import { resolveApiKeyFor } from "../../settings/secrets";
import type { MemVectorSettings } from "../../settings/types";
import { callDirectLLM } from "../../llm/callDirectLLM";
import { formatLlmResponse } from "../../llm/llmResponse";
import { getTranslation } from "../../i18n";
import { capText, stripFrontmatter } from "../../noteContent";
import { toSlug } from "../../noteSlug";
import { SynthesisResultModal } from "../../modals/SynthesisResultModal";
import { contextWarnings, enrichContext, type EnrichedNote } from "./contextEnrichment";
import { loadAgentsGuidelines } from "./agentsGuidelines";
import { loadRelationEdges } from "./relationEdges";
import type { RelationEdge, ScatterNode } from "./types";

function buildEnrichedSection(enriched: EnrichedNote[], lang: string, contentCapChars: number): string {
  if (enriched.length === 0) return "";

  const heading =
    lang === "de"
      ? "Automatisch per GraphRAG gefundene, verwandte Notizen (NICHT vom Nutzer ausgewählt - nur Hintergrundkontext aus semantischer Vektor-Ähnlichkeit und Multi-Hop-Graph-Beziehungen; der Fokus bleibt auf den oben ausgewählten Notizen):"
      : "Automatically found related notes via GraphRAG (NOT selected by the user - background context only, retrieved via semantic vector similarity and multi-hop graph relationships; focus stays on the notes selected above):";

  // enrichContext() already applied contentCapChars when it read each neighbor's
  // content (contextEnrichment.ts) - capping again here would silently override
  // that with a different, hardcoded number (the actual F07 bug), so this only
  // re-applies the same configured cap, never a second/different one.
  return `\n${heading}\n${enriched
    .map((n) => `- [${n.sources.join("+")}] "${n.title}": ${capText(n.content, contentCapChars)}`)
    .join("\n")}\n`;
}

import { detectModelTier } from "../../llm/modelTiers";
import { relationsFolder } from "../../vaultLayout";

export interface SynthesisNoteContent extends ScatterNode {
  /** Full current note body, freshly re-read from the vault - never the scanner's fixed-size canvas preview (vaultScan.ts caps that at 800 chars for layout/similarity purposes unrelated to synthesis quality). */
  fullContent: string;
}

/**
 * Purpose: Filters explicit relation edges to those connecting active notes, deduplicating bidirectional and redundant pairs.
 */
export function findRelevantRelationEdges(
  edges: RelationEdge[],
  activeNodeIds: ReadonlySet<string>
): RelationEdge[] {
  const result: RelationEdge[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    const src = edge.srcId.toLowerCase();
    const tgt = edge.tgtId.toLowerCase();
    if (src === tgt) continue;
    if (!activeNodeIds.has(src) || !activeNodeIds.has(tgt)) continue;

    const dedupKey = edge.bidirectional
      ? `bi:${[src, tgt].sort().join("<->")}:${edge.relType.toUpperCase()}`
      : `dir:${src}->${tgt}:${edge.relType.toUpperCase()}`;

    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    result.push(edge);
  }

  return result;
}

/**
 * Purpose: Formats explicit relation edges connecting active notes as a Markdown block for prompt context.
 */
export function buildRelationEdgesSection(
  edges: RelationEdge[],
  titleMap: ReadonlyMap<string, string>,
  lang: string
): string {
  if (edges.length === 0) return "";

  // Heading and reason label live in the translation files only - keeping a second
  // inline copy here meant every wording change had to be made twice and the keys
  // silently drifted from what the prompt actually contained.
  const t = getTranslation(lang);
  const heading = `### ${t.synthRelHeading}`;
  const reasonLabel = t.synthRelReasonLabel;

  const lines = edges.map((e) => {
    const src = titleMap.get(e.srcId.toLowerCase()) || e.srcId;
    const tgt = titleMap.get(e.tgtId.toLowerCase()) || e.tgtId;
    const arrow = e.bidirectional ? `<--[${e.relType}]-->` : `--[${e.relType}]-->`;
    const desc = e.desc?.trim() ? ` (${reasonLabel}: ${e.desc.trim()})` : "";
    return `- [[${src}]] ${arrow} [[${tgt}]]${desc}`;
  });

  return `\n${heading}\n${lines.join("\n")}\n`;
}

/**
 * Purpose: Assembles the LLM synthesis prompt with note summaries, enriched neighbors, and explicit knowledge graph relations.
 */
export function buildPrompt(
  selected: SynthesisNoteContent[],
  isMath: boolean,
  lang: string,
  promptLang: string,
  contentCapChars: number,
  customQuestion?: string,
  enriched: EnrichedNote[] = [],
  isFrontier = false,
  relationEdges: RelationEdge[] = []
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

  const titleMap = new Map<string, string>();
  for (const n of selected) {
    titleMap.set(n.id.toLowerCase(), n.title);
  }
  for (const n of enriched) {
    titleMap.set(n.id.toLowerCase(), n.title);
  }

  const enrichedBlock = buildEnrichedSection(enriched, lang, contentCapChars);
  const relationEdgesBlock = buildRelationEdgesSection(relationEdges, titleMap, lang);
  const contextBlocks = `${notesSummary}${enrichedBlock}${relationEdgesBlock}`;
  const trimmedQuestion = customQuestion?.trim();

  if (trimmedQuestion) {
    return lang === "de"
      ? `Du bist ein erfahrener KI-Assistent für Wissenssynthese in Obsidian.
Analysiere folgende ${selected.length} ausgewählte Notizen aus dem Vault:

${contextBlocks}

Aufgabe: Beantworte präzise auf Deutsch die folgende Frage zu diesen Notizen:
"${trimmedQuestion}"

Richtlinien:
- Strukturiere die Antwort klar und verständlich.
- Verknüpfe zentrale Fachbegriffe und Notiztitel mit Obsidian WikiLinks: [[Notizname]].`
      : `You are an expert AI knowledge synthesis assistant for Obsidian.
Analyze the following ${selected.length} selected notes from the vault:

${contextBlocks}

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

${contextBlocks}

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

${contextBlocks}

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

${contextBlocks}

Aufgabe: Erstelle eine strukturierte Wissenssynthese auf Deutsch:
1. **Kernzusammenhang**: Welcher übergeordnete Gedanke verbindet diese Notizen?
2. **Querverbindungen**: Wie ergänzen sich die behandelten Aspekte oder bauen aufeinander auf?
3. **Fazit / Synergie**: Welche neue Erkenntnis ergibt sich aus der gemeinsamen Betrachtung?

Richtlinien:
- Strukturiere die Antwort mit klaren Abschnitten.
- Verknüpfe zentrale Begriffe mit Obsidian WikiLinks [[Begriffsname]].`
    : `You are an expert AI knowledge synthesis assistant for Obsidian.
Analyze the relationship between the following ${selected.length} notes:

${contextBlocks}

Task: Create a structured knowledge synthesis in English:
1. **Core Connection**: What overarching idea connects these notes?
2. **Cross-Links**: How do these concepts complement or build on each other?
3. **Takeaway / Synergy**: What new insight arises from viewing them together?

Guidelines:
- Structure the response with clear headings.
- Link key concepts with Obsidian WikiLinks [[Concept Name]].`;
}

/**
 * Purpose: Builds deterministic lookup map from note slugs and aliases to canonical basenames.
 */
function buildVaultTitleMap(app: App): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of app.vault.getMarkdownFiles().slice().sort((a, b) => a.path.localeCompare(b.path, "en"))) {
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
  const prospectiveTerms = new Set<string>();
  let text = raw.replace(/\*\*([^*]+)\*\*/g, (match, term: string) => {
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
  customQuestion?: string,
  excludedContextIds?: ReadonlySet<string>
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
  let warnings: string[] = [];
  if (settings.enrichSynthesisContext) {
    const hopDepth = settings.synthesisHopDepth ?? 2;
    setHoverText(`[INFO] ${t.synthSearchingContext} (${tier}, ${hopDepth} ${hopDepth === 1 ? t.lblHopSingle : t.lblHopPlural})...`);
    // Manually dismissed notes from the context preview stay excluded from the
    // final synthesis payload (Issue #116).
    const context = await enrichContext(app, settings, selected, contentCapChars, hopDepth, excludedContextIds);
    enriched = context.notes;
    warnings = contextWarnings(context, t);
    if (warnings.length > 0) new Notice(warnings.join("\n"), 10000);
  }

  const allEdges = await loadRelationEdges(app, settings.vectorSearchExclusions, relationsFolder(settings));
  const activeIds = new Set<string>([
    ...selected.map((n) => n.id.toLowerCase()),
    ...enriched.map((n) => n.id.toLowerCase()),
  ]);
  const relevantEdges = findRelevantRelationEdges(allEdges, activeIds);

  setHoverText(`${modelName} (${tier.toUpperCase()}) ...`);

  let prompt = buildPrompt(
    selectedWithFullContent,
    settings.knowledgeDomain === "math",
    lang,
    t.llmPromptLang,
    contentCapChars,
    customQuestion,
    enriched,
    isFrontier,
    relevantEdges
  );

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

  let synthesisText: string;
  try {
    const response = await callDirectLLM(prompt, apiBase, apiKey, modelName, temperature, t.llmSystemPrompt, settings.llmProvider);
    synthesisText = formatLlmResponse({ ...response, content: linkifySynthesis(response.content, buildVaultTitleMap(app), lang) }, t.synthThinkingBlockTitle);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setHoverText(`[ERROR] ${msg.slice(0, 70)}`);
    new Notice(`[ERROR] ${t.llmErrorPrefix} ${msg}`, 10000);
    return;
  }

  new SynthesisResultModal(app, selected, synthesisText, modelName, settings, warnings).open();
  setHoverText(`${modelName} ${t.synthCompletePrefix} ${selected.length} ${t.synthCompleteSuffix}`);
}
