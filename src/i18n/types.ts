export interface TranslationKeys {
  sidebarTitle: string;
  settingsTitle: string;
  settingsDesc: string;

  secGeneral: string;
  langName: string;
  langDesc: string;

  secLLM: string;
  llmProvName: string;
  llmProvDesc: string;
  apiBaseUrlName: string;
  apiBaseUrlDesc: string;
  apiKeyName: string;
  apiKeyDesc: string;
  modelNameTitle: string;
  modelNameDesc: string;
  temperatureTitle: string;
  temperatureDesc: string;

  secVector: string;
  domainName: string;
  domainDesc: string;
  domainGeneral: string;
  domainMath: string;
  embedProvName: string;
  embedProvDesc: string;
  embedApiBaseName: string;
  embedApiBaseDesc: string;
  embedApiKeyName: string;
  embedApiKeyDesc: string;
  embedModelName: string;
  embedModelDesc: string;
  exclusionsName: string;
  exclusionsDesc: string;
  radarCountName: string;
  radarCountDesc: string;

  secQdrant: string;
  qdrantUrlName: string;
  qdrantUrlDesc: string;
  qdrantCollName: string;
  qdrantCollDesc: string;
  qdrantKeyName: string;
  qdrantKeyDesc: string;
  qdrantAutoSyncName: string;
  qdrantAutoSyncDesc: string;

  secMemgraph: string;
  memgraphUrlName: string;
  memgraphUrlDesc: string;
  memgraphUserName: string;
  memgraphUserDesc: string;
  memgraphPassName: string;
  memgraphPassDesc: string;
  memgraphAutoSyncName: string;
  memgraphAutoSyncDesc: string;

  secFilter: string;
  secView: string;
  secActions: string;
  lblShowEdges: string;
  lblLasso: string;
  lblProjection: string;
  projClouds: string;
  projUmap: string;
  projNode2Vec: string;
  projFormula: string;
  projSemanticAnchors: string;
  projFlow: string;
  projGraph: string;
  btnScanVault: string;
  btnCalcVectors: string;
  btnCreateRel: string;
  btnClearSel: string;
  hoverHint: string;
  secSynthesis: string;
  synthPromptPlaceholder: string;
  synthEnrichToggle: string;

  relModalTitle: string;
  relNotesSelected: string;
  relFlowPreview: string;
  relSwapDirection: string;
  relBulkChange: string;
  relTopologyTitle: string;
  relTopoFocalToRest: string;
  relTopoRestToFocal: string;
  relTopoChain: string;
  relFocalNote: string;
  relDescTitle: string;
  relDescPlaceholder: string;
  relCypherSummary: string;
  relCancelBtn: string;
  relSaveBtn: string;
  relSaving: string;
  relSaveSuccess: string;
  relSaveError: string;
  relDefaultDesc: string;
  relBetween: string;
  relAnd: string;
  relFileHeading: string;
  relFileType: string;
  relFileSource: string;
  relFileTarget: string;
  relFileReason: string;

  relCatLogic: string;
  relCatProofs: string;
  relCatDefinitions: string;
  relCatStructure: string;
  relCatExamples: string;

  relImplies: string;
  relEquivalentTo: string;
  relNecessaryCondition: string;
  relSufficientCondition: string;
  relContradicts: string;
  relIndependentOf: string;
  relProves: string;
  relRefutes: string;
  relFollowsFrom: string;
  relBasedOn: string;
  relCorollaryOf: string;
  relLemmaFor: string;
  relDefines: string;
  relEquivDef: string;
  relSpecialCase: string;
  relGeneralizes: string;
  relExtends: string;
  relIsomorphicTo: string;
  relEmbeddedIn: string;
  relDualTo: string;
  relAnalogousTo: string;
  relOppositeOf: string;
  relExampleFor: string;
  relCounterexampleFor: string;
  relCustom: string;
  relCustomPlaceholder: string;

  llmSystemPrompt: string;
  llmPromptLang: string;

  synthModalTitle: string;
  synthLinkedNotes: string;
  synthSaveBtn: string;
  synthSaving: string;
  synthCloseBtn: string;
  synthDocDesc: string;

  noticeEmbeddingError: string;
  noticeVectorsCalc: string;
  noticeVectorsCalcSuffix: string;
  noticeSynthSaved: string;
  noticeSynthSavedSuffix: string;
}

export type SupportedLanguage = "de" | "en";
