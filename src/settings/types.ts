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

  /** Per-provider name of the secret selected via SecretComponent - resolved to the actual key at request time (settings/secrets.ts). */
  llmApiKeySecretNames?: Partial<Record<LlmProvider, string>>;
  /** Name of the secret selected for the embedding provider via SecretComponent - resolved to the actual key at request time (settings/secrets.ts). */
  embeddingApiKeySecretName?: string;

  vectorSearchExclusions: string;
  radarNoteCount: number;

  /**
   * Index standard Obsidian [[WikiLinks]] as LINKS_TO graph relations (Issue #100).
   * Default false: the graph store indexes only explicit typed relations from the
   * Relation Builder, so GraphRAG multi-hop traversal and 2D topology weights follow
   * the pure MemVector paradigm (semantic vectors + intentional typed relations).
   * Takes effect on the next full vault re-index.
   */
  includeWikiLinksAsRelations: boolean;

  /** Hybrid GraphRAG: pull vector-similar + graph-neighbor notes into the LLM synthesis prompt as extra context. */
  enrichSynthesisContext: boolean;
  /** Maximum graph traversal depth (1-3 hops) for GraphRAG context enrichment, independent of canvas visual hops. Controlled from the toolbar Synthese section only (Issue #103). */
  synthesisHopDepth: number;
  /**
   * Maximum number of GraphRAG neighbors admitted per hop level (Issue #103) - 0 means
   * unlimited per level. Each hop level gets its own quota, so a dense hop-1 neighborhood
   * can no longer crowd deeper hops out of the synthesis context.
   */
  hopLevelNeighborLimit: number;
  /** Maximum vector-similar notes admitted to the GraphRAG context - 0 = unlimited (Issue #103). */
  vectorNeighborLimit: number;
  /**
   * Minimum cosine similarity for vector-channel context notes (0-1) - 0 disables the
   * floor. Applied even when vectorNeighborLimit is 0, so "unlimited" still means
   * "unlimited notes related to the selection", not the whole vault (Issue #103).
   */
  minVectorSimilarity: number;
  /**
   * Maximum total enriched context notes (vector + graph merged) in the synthesis prompt -
   * 0 = unlimited (Issue #103). Replaces the old hardcoded model-tier budget; nothing is
   * silently trimmed anymore unless this is set.
   */
  totalContextLimit: number;
  /** Per-file max characters of AGENTS.md house-style guidelines in the synthesis prompt - 0 = unlimited (full file). */
  agentsGuidelinesCharCap: number;

  /** Include the vault's own AGENTS.md (if present) as house-style guidance in the synthesis prompt. */
  includeAgentsGuidelines: boolean;
  /** Comma-separated vault paths to load for includeAgentsGuidelines - defaults to AGENTS.md. */
  agentsGuidelinePaths: string;

  /** Vault path to the relation-type vocabulary file (relationVocabulary/loadRelationVocabulary.ts). Auto-created with a bundled STEM preset on first use - fully editable/replaceable for any other domain. */
  relationVocabularyPath: string;

  /**
   * Max characters of a selected note's (and, identically, a GraphRAG neighbor's)
   * body sent into the synthesis prompt - 0 means unlimited (full note text).
   * Simple prefix truncation when set: whatever falls after the cap is dropped,
   * wherever it lands in the note. A smarter, context-aware allocation is a
   * possible future improvement; this is intentionally the simple version for now.
   */
  synthesisContentCapChars: number;

  fetchedLlmModels?: string[];
  fetchedEmbedModels?: string[];

  scatterVisualStyle: ScatterVisualStyle;
  /** Whether relation notes (wiki/relations/) are rendered as nodes in the 2D scatter view. Default false - moved from the toolbar into settings. */
  showRelationNotes: boolean;
  /** Opacity (0-1) for the title label of any note that is neither selected/hovered nor connected to it. */
  unselectedLabelOpacity: number;
  /** Distance scaling multiplier between individual nodes in the 2D scatter view. */
  scatterNodeSpacing?: number;
  /** Distance scaling between semantic cluster clouds in the 2D scatter view. */
  scatterCloudSpacing?: number;
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
