import { TFile, type App } from "obsidian";
import type { MemVectorSettings } from "../../settings/types";
import type { RetrievalResult } from "../../retrievalStatus";
import { getVectorStore } from "../../sync/storeFactory";
import { relationsFolder } from "../../vaultLayout";
import { classifyNoteType, extractFormulas, rankCandidates, shouldExcludeFromRadar, type ScoredNote } from "./activeNoteScoring";

export async function findVectorNeighbors(app: App, settings: MemVectorSettings, activeFile: TFile, limit: number): Promise<RetrievalResult<ScoredNote[]>> {
  try {
    const store = getVectorStore(app, settings);
    const activeVector = await store.getVector(activeFile.path);
    if (!activeVector?.length) return { status: "unindexed", data: [] };

    const hits = await store.search(activeVector, limit + 1);
    const seen = new Set<string>([activeFile.path]);
    const neighbors: ScoredNote[] = [];
    for (const hit of hits) {
      if (seen.has(hit.payload.path) || !Number.isFinite(hit.score)) continue;
      const file = app.vault.getAbstractFileByPath(hit.payload.path);
      if (!(file instanceof TFile) || shouldExcludeFromRadar(file, settings.vectorSearchExclusions)) continue;
      seen.add(file.path);
      neighbors.push({
        file,
        type: classifyNoteType(file.path, file.name, app.metadataCache.getFileCache(file)?.frontmatter?.type, relationsFolder(settings)),
        score: hit.score,
        formulas: extractFormulas(hit.payload.content || ""),
        content: hit.payload.content || "",
      });
    }
    if (neighbors.length === 0) {
      const otherFilesExist = app.vault.getMarkdownFiles().some(
        (file) => file.path !== activeFile.path && !shouldExcludeFromRadar(file, settings.vectorSearchExclusions)
      );
      if (otherFilesExist) {
        return { status: "unindexed", data: [] };
      }
    }
    return { status: "ready", data: neighbors };
  } catch (err) {
    console.warn("Vector-based radar neighbors unavailable, falling back to local scoring:", err);
    return { status: "error", data: [] };
  }
}

/** Store IO and fallback scoring stay separate from radar drawing and interaction. */
export async function loadRadarNeighbors(app: App, settings: MemVectorSettings | undefined, activeFile: TFile, activeContent: string, limit: number): Promise<RetrievalResult<ScoredNote[]>> {
  const result = settings
    ? await findVectorNeighbors(app, settings, activeFile, limit)
    : { status: "unindexed" as const, data: [] };
  if (result.status === "ready") return result;

  const files = app.vault.getMarkdownFiles().slice().sort((a, b) => a.path.localeCompare(b.path, "en"))
    .filter((file) => file.path !== activeFile.path && !shouldExcludeFromRadar(file, settings?.vectorSearchExclusions));
  const candidates: { file: TFile; content: string }[] = [];
  for (const file of files) candidates.push({ file, content: await app.vault.cachedRead(file) });
  return { status: result.status, data: rankCandidates(activeContent, candidates).slice(0, limit) };
}
