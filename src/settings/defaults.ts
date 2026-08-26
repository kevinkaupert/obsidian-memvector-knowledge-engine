import type { MemVectorSettings } from "./types";

export const DEFAULT_SETTINGS: MemVectorSettings = {
  language: "de",
  knowledgeDomain: "general",

  embeddingProvider: "ollama",
  embeddingApiBaseUrl: "http://localhost:11434/v1",
  embeddingModel: "bge-m3",

  llmProvider: "ollama",
  apiBaseUrl: "http://localhost:11434/v1",
  modelName: "deepseek-r1:7b",
  temperature: 0.1,

  vectorSearchExclusions:
    "-path:schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks",
  weightVector: 50,
  weightWikiLinks: 30,
  weightFolder: 10,
  weightSemantics: 10,
  radarNoteCount: 10,
  synthesisLinkMode: "suggested_section",
  cloudNamingMode: "centroid",

  qdrantUrl: "http://localhost:6333",
  qdrantCollection: "obsidian_wiki_vectors",
  autoSyncQdrant: false,

  // Bolt endpoint (was previously an inert HTTP-Cypher URL that no working
  // sync path ever actually reached — see settings/secrets.ts's sibling,
  // sync/memgraph/memgraphSync.ts, for the real client).
  memgraphUrl: "bolt://localhost:7687",
  memgraphUser: "",
  autoSyncMemgraph: false,
  pendingMemgraphRelations: [],
  enrichSynthesisContext: false,
  includeAgentsGuidelines: false,
  agentsGuidelinePaths: "AGENTS.md, meta/PROFILE.md",
  scatterVisualStyle: "ink",
  unselectedLabelOpacity: 0.35,
};
