import type { RelationTermDef } from "./types";

/** No preamble, no restating the task - keeps the request as lean as possible, so even a small local model (e.g. a 1.5B-parameter one) stays on-format. */
export const LEAN_CLASSIFIER_SYSTEM_PROMPT = "Respond strictly in the given format, with no additional text.";

export interface EdgeSuggestion {
  label: string;
  reason: string;
  counterexample: string | null;
}

export interface EdgeVerification {
  valid: boolean;
  reason: string;
  counterexample: string | null;
}

export interface NoteRef {
  title: string;
  path: string;
}

/**
 * The label choices offered to the LLM: the vocabulary's `suggest: true`
 * subset (deduped by label, keeping the first term's display text as a short
 * hint), or - if nothing in the vocabulary opts in - every unique label, so a
 * freshly-written custom vocabulary still works without any extra setup.
 */
export function suggestableLabels(defs: RelationTermDef[]): { label: string; hint: string }[] {
  const flagged = defs.filter((d) => d.suggest);
  const source = flagged.length > 0 ? flagged : defs;
  const seen = new Map<string, string>();
  for (const d of source) {
    if (!seen.has(d.label)) seen.set(d.label, d.term);
  }
  return [...seen.entries()].map(([label, hint]) => ({ label, hint }));
}

export function buildEdgeSuggestionPrompt(defs: RelationTermDef[], titleA: string, excerptA: string, titleB: string, excerptB: string): string {
  const labels = suggestableLabels(defs);
  const labelLines = labels.map((l) => `- ${l.label} ("${l.hint}")`).join("\n");
  const labelChoices = labels.map((l) => l.label).join("|");

  return `Analyze the relationship of Concept A to Concept B:

Concept A: ${titleA} - ${excerptA}
Concept B: ${titleB} - ${excerptB}

Pick the best-fitting relation:
${labelLines}

Answer briefly:
LABEL: <${labelChoices}>
REASON: <one precise sentence>
COUNTEREXAMPLE: <None, or a concrete counterexample>`;
}

export function buildEdgeVerificationPrompt(label: string, titleA: string, excerptA: string, titleB: string, excerptB: string): string {
  return `Check the following graph relationship claim:

CLAIM: (\`${titleA}\`) -[${label}]-> (\`${titleB}\`)

Concept A: ${excerptA}
Concept B: ${excerptB}

Is this claim correct?
VALID: <true|false>
REASON: <one sentence justification>
COUNTEREXAMPLE: <None if true, otherwise a counterexample>`;
}

function parseCounterexample(raw: string | undefined): string | null {
  const text = (raw || "").trim();
  return !text || /^none/i.test(text) ? null : text;
}

/** Tolerant of a preceding <think>...</think> block (deepseek-r1 and similar reasoning models emit one) since it searches anywhere in the text rather than anchoring to the start. */
export function parseEdgeSuggestion(raw: string, allowedLabels: string[]): EdgeSuggestion | null {
  const labelMatch = raw.match(/LABEL:\s*([A-Za-z_]+)/);
  const label = labelMatch?.[1]?.trim().toUpperCase();
  if (!label || !allowedLabels.includes(label)) return null;

  return {
    label,
    reason: (raw.match(/REASON:\s*(.+)/)?.[1] || "").trim(),
    counterexample: parseCounterexample(raw.match(/COUNTEREXAMPLE:\s*(.+)/)?.[1]),
  };
}

export function parseEdgeVerification(raw: string): EdgeVerification | null {
  const validMatch = raw.match(/VALID:\s*(true|false)/i);
  if (!validMatch) return null;

  return {
    valid: validMatch[1].toLowerCase() === "true",
    reason: (raw.match(/REASON:\s*(.+)/)?.[1] || "").trim(),
    counterexample: parseCounterexample(raw.match(/COUNTEREXAMPLE:\s*(.+)/)?.[1]),
  };
}

