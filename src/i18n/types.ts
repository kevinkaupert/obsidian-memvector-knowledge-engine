export interface TranslationKeys {
  sidebarTitle: string;
  settingsTitle: string;
  settingsDesc: string;

  secGeneral: string;
  langName: string;
  langDesc: string;
  secGeneralScan: string;
  secGeneralSynthesis: string;
  linkModeName: string;
  linkModeDesc: string;
  linkModeSuggested: string;
  linkModeExistingOnly: string;
  linkModeAllConcepts: string;
  cloudNamingName: string;
  cloudNamingDesc: string;
  cloudNamingCentroid: string;
  cloudNamingLlm: string;

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
  wikiLinksAsRelationsName: string;
  wikiLinksAsRelationsDesc: string;
  agentsPathsName: string;
  agentsPathsDesc: string;
  agentsIncludeDesc: string;
  scatterStyleName: string;
  scatterStyleDesc: string;
  showRelationNotesDesc: string;
  relVocabPathName: string;
  relVocabPathDesc: string;
  labelOpacityName: string;
  labelOpacityDesc: string;
  radarCountName: string;
  radarCountDesc: string;

  secFilter: string;
  secView: string;
  secActions: string;
  lblShowEdges: string;
  lblShowRelationNotes: string;
  lblLasso: string;
  searchPlaceholder: string;
  searchNotFound: string;
  lblVisualStyle: string;
  lblEdgeHops: string;
  edgeHopsAll: string;
  edgeHopsUnlimited: string;
  styleMonochrome: string;
  styleMuted: string;
  styleInk: string;
  btnScanVault: string;
  btnCalcVectors: string;
  btnCreateRel: string;
  btnClearSel: string;
  hoverHint: string;
  secSynthesis: string;
  synthPromptPlaceholder: string;
  synthEnrichToggle: string;
  synthAgentsToggle: string;
  relModalEditTitle: string;

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
  relConflictError: string;
  relDeleteBtn: string;
  relDeleteConfirm: string;
  relDeleting: string;
  relDeleteSuccess: string;
  relDeleteSyncWarning: string;
  relDeleteFileError: string;
  relDefaultDesc: string;
  relBetween: string;
  relAnd: string;
  relFileHeading: string;
  relFileType: string;
  relFileSource: string;
  relFileTarget: string;
  relFileReason: string;
  relFileOriginalTerm: string;
  relFileBidirectional: string;
  relBidirectionalYes: string;
  relBidirectionalNo: string;

  relLoadingVocabulary: string;
  relCustom: string;
  relCustomPlaceholder: string;

  // Relation Types section (Settings, Issue #119)
  secRelationTypes: string;
  relPresetName: string;
  relPresetDesc: string;
  relPresetCustomOption: string;
  relPresetNewBtn: string;
  relPresetRenameBtn: string;
  relPresetDeleteBtn: string;
  relPresetActivated: string;
  relPresetCreated: string;
  relPresetRenamed: string;
  relPresetDeleted: string;
  relPresetError: string;
  relPresetNameModalTitle: string;
  relPresetNameModalOk: string;
  relPresetNameModalCancel: string;
  relTypesInPreset: string;
  relTypeColLabel: string;
  relTypeColCategory: string;
  relTypeColWeight: string;
  relTypeColDirection: string;
  relTypeColRepels: string;
  relTypeAddBtn: string;
  relTypeAddLabelPlaceholder: string;
  relTypeAddCategoryPlaceholder: string;
  relTypeAddBidirectional: string;
  relTypeAddRepels: string;
  relTypeAdded: string;
  relTypeDuplicate: string;
  relTypeRemoved: string;
  relTypeResetBtn: string;
  relTypeResetDone: string;
  relTypeWriteError: string;

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

  // Settings actions & tests
  testLlmConnTitle: string;
  testLlmConnDesc: string;
  testLlmConnBtn: string;
  testConnTesting: string;
  testConnSuccess: string;
  testConnFail: string;
  testLlmNoticeSuccess: string;
  testLlmNoticeFail: string;
  testLlmNoticeModelsFound: string;

  testEmbedConnTitle: string;
  testEmbedConnDesc: string;
  testEmbedConnBtn: string;
  testEmbedNoticeSuccess: string;
  testEmbedNoticeFail: string;

  indexVaultTitle: string;
  indexVaultDesc: string;
  indexVaultBtn: string;
  indexVaultIndexing: string;
  indexVaultSuccess: string;
  indexVaultNoticeStarting: string;
  indexVaultNoticeSaved: string;

  synthesisContentCapTitle: string;
  synthesisContentCapDesc: string;
  hopLevelLimitTitle: string;
  hopLevelLimitDesc: string;
  vectorNeighborLimitTitle: string;
  vectorNeighborLimitDesc: string;
  minVectorSimTitle: string;
  minVectorSimDesc: string;
  totalContextLimitTitle: string;
  totalContextLimitDesc: string;
  agentsGuidelinesCapTitle: string;
  agentsGuidelinesCapDesc: string;
  contextPreviewTitle: string;
  previewEmpty: string;
  lblSynthHopDepth: string;
  temperatureAnthropicNote: string;

  // Toolbar & Status feedback
  statusVectorsOk: string;
  statusPersistenceError: string;
  hoverPersistenceError: string;
  noticePersistenceError: string;
  statusErrorCount: string;
  unknownError: string;
  toggleToolbar: string;

  // Sidebar
  sidebarNearbyNotes: string;

  // Ribbon & Commands
  ribbonSidebar: string;
  ribbonScatter: string;
  cmdOpenSidebar: string;
  cmdOpenScatter: string;

  // Provider options
  provOllama: string;
  provCustomRest: string;

  // Notices & Status prefixes
  indexVaultNoticeStartingSuffix: string;
  indexVaultNoticeSavedSuffix: string;
  syncErrorPrefix: string;
  saveErrorPrefix: string;
  relVocabLoadWarn: string;
  synthCompletePrefix: string;
  synthCompleteSuffix: string;
  llmErrorPrefix: string;

  lblNodeSpacing: string;
  lblCloudSpacing: string;
  btnFitView: string;
  statusScanningVault: string;
  statusNotesScanned: string;
  statusSelectedSuffix: string;
  statusVectorsCalculating: string;
  statusCalcEmbeddings: string;
  warnNoNotesForVectors: string;
  modelLabelPrefix: string;
}

export type SupportedLanguage = "de" | "en";
