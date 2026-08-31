export type LlmProvider = "ollama" | "claude" | "deepseek" | "openai" | "openrouter" | "custom";
export type KnowledgeDomain = "general" | "math";
/** Vector-graph rendering theme: "monochrome" (neutral dots, color only on selection), "muted" (desaturated per-type colors), "ink" (outline-only dots, glow for connected notes). */
export type ScatterVisualStyle = "monochrome" | "muted" | "ink";

export type ApiKeyMap = Partial<Record<LlmProvider, string>>;

export interface MemVectorSettings {
  language: string;
  knowledgeDomain: KnowledgeDomain;

  embeddingProvider: LlmProvider;
  embeddingApiBaseUrl: string;
  embeddingModel: string;

  llmProvider: LlmProvider;
  apiBaseUrl: string;
  modelName: string;
  temperature: number;

  vectorSearchExclusions: string;
  radarNoteCount: number;

  /** Hybrid GraphRAG: pull vector-similar + graph-neighbor notes into the LLM synthesis prompt as extra context. */
  enrichSynthesisContext: boolean;

  /** Include the vault's own AGENTS.md / meta/PROFILE.md (if present) as house-style guidance in the synthesis prompt. */
  includeAgentsGuidelines: boolean;
  /** Comma-separated vault paths to load for includeAgentsGuidelines - defaults to AGENTS.md, meta/PROFILE.md. */
  agentsGuidelinePaths: string;

  /** Vault path to the relation-type vocabulary file (relationVocabulary/loadRelationVocabulary.ts). Auto-created with a bundled STEM preset on first use - fully editable/replaceable for any other domain. */
  relationVocabularyPath: string;

  fetchedLlmModels?: string[];
  fetchedEmbedModels?: string[];

  scatterVisualStyle: ScatterVisualStyle;
  /** Opacity (0-1) for the title label of any note that is neither selected/hovered nor connected to it. */
  unselectedLabelOpacity: number;
}

export interface RelationGraphNode {
  id: string;
  title: string;
  path: string;
  type: string;
}

/**
 * Minimal shape settings-tab sections need from the plugin instance.
 */
export interface SettingsHost {
  settings: MemVectorSettings;
  saveSettings(): Promise<void>;
}
