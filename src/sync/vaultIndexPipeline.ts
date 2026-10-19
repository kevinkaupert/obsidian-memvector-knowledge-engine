import { Component, TFile, type App } from "obsidian";
import type { MemVectorSettings } from "../settings/types";
import { VaultEventQueue, emptyChanges, type PendingVaultChanges, type VaultNoteChange } from "../views/vectorScatter/vaultEventQueue";
import { relationsFolder, resolveVocabularyPath } from "../vaultLayout";
import { cachedFrontmatterType } from "../views/vectorScatter/vaultScan";
import { buildLinkKeys, hasLinkKeys } from "../frontmatterLinks";
import { isRelationNote } from "../relationNotes";
import { shouldIncludeFile } from "../vaultFilter";
import { toSlug } from "../noteSlug";
import { duplicateIdPaths, invalidateNoteKeys, lostDuplicateIdPaths, noteKey } from "../noteKey";
import { buildEmbeddingInput, parseEmbeddingFrontmatterKeys } from "./embeddingText";
import { embeddingTargetChanged, resolveEmbeddingTarget } from "./embeddingTarget";
import { resolveEmbeddingApiKey } from "../settings/secrets";
import { fetchEmbedding } from "../llm/fetchEmbedding";
import { getGraphStore, getVectorStore } from "./storeFactory";
import { migrateVaultNoteKeys } from "./sqlite/noteKeyMigration";
import { deleteNodePosition, moveNodePosition, reconcileNodePositionsWithVault } from "./sqlite/nodePositions";
import { syncVaultGraph } from "./vaultGraphSync";
import { readRelationLabels } from "../relationVocabulary/presets";
import { DEFAULT_RELATION_VOCABULARY } from "../relationVocabulary/defaultVocabulary";
import { syncVaultVectors } from "./vaultVectorSync";
import { EmbeddingAbortedError } from "./vectorPipeline";

export interface PipelineTimerHost {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(id: number): void;
}

/**
 * Purpose: Plugin-level incremental, debounced indexing pipeline for vault changes (Issue #250).
 * Architecture: Centralizes vault event handling (create, modify, rename, delete, metadataCache changed)
 * and keeps vector embeddings and graph relations synchronized in SQLite in the background when opted in.
 * Scatter views consume the coalesced batches from this pipeline rather than registering their own vault watchers.
 */
export class VaultIndexingPipeline {
  private readonly queue: VaultEventQueue;
  private readonly subscribers = new Set<(changes: PendingVaultChanges) => void>();
  private workChain: Promise<void> = Promise.resolve();
  private activeVocabLabels: string[] = DEFAULT_RELATION_VOCABULARY.map((t) => t.label);
  private notesWithLinks = new Set<string>();
  private knownRelationNotes = new Set<string>();
  /** Last key seen per note, to notice a key change from a frontmatter id edit (ADR-0007). */
  private seenKeys = new Map<string, string>();
  private isDisposed = false;

  constructor(
    private readonly app: App,
    private readonly getSettings: () => MemVectorSettings,
    private readonly timers: PipelineTimerHost = window
  ) {
    this.queue = new VaultEventQueue(() => this.processQueue(), timers);
    void this.refreshVocabLabels().then(() => this.initializeRelationTracking());
  }

  async refreshVocabLabels(): Promise<void> {
    try {
      this.activeVocabLabels = await readRelationLabels(this.app, this.getSettings());
    } catch {
      // Keep existing labels
    }
  }

  initializeRelationTracking(): void {
    const files = this.app.vault.getMarkdownFiles?.() ?? [];
    const folder = relationsFolder(this.getSettings());
    const linkKeys = buildLinkKeys(this.activeVocabLabels);
    for (const file of files) {
      const cache = this.app.metadataCache?.getFileCache(file);
      const type = typeof cache?.frontmatter?.type === "string" ? cache.frontmatter.type : undefined;
      if (isRelationNote(file.path, type, folder)) {
        this.knownRelationNotes.add(file.path);
      }
      if (hasLinkKeys(cache?.frontmatter, linkKeys)) {
        this.notesWithLinks.add(file.path);
      }
      if (cache) this.seenKeys.set(file.path, noteKey(this.app, file.path));
    }
  }

  /**
   * Purpose: Subscribes an open view to coalesced vault changes.
   * Architecture: Returns an unsubscribe callback for clean view teardown.
   */
  subscribe(callback: (changes: PendingVaultChanges) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Purpose: Registers reactive vault event watchers that feed this pipeline's event queue.
   */
  registerWatchers(component: Component): void {
    if (!this.app?.vault?.on) return;
    this.initializeRelationTracking();

    const isVocabulary = (p?: string) => Boolean(p && p === resolveVocabularyPath(this.getSettings()));
    const fmType = (file: { path: string }) => (file instanceof TFile ? cachedFrontmatterType(this.app, file) : undefined);
    const linkKeys = () => buildLinkKeys(this.activeVocabLabels);
    const isRel = (path: string, type?: string) => isRelationNote(path, type, relationsFolder(this.getSettings()));
    const checkLinks = (file: { path: string }) => {
      const has = file instanceof TFile && hasLinkKeys(this.app.metadataCache?.getFileCache(file)?.frontmatter, linkKeys());
      if (has) this.notesWithLinks.add(file.path);
      return has;
    };
    const isMd = (p?: string) => Boolean(p && p.endsWith(".md"));

    const handleFileEvent = (file: { path: string }, kind: "create" | "modify" | "delete") => {
      if (!file?.path) return;
      invalidateNoteKeys(this.app);
      if (isVocabulary(file.path)) {
        this.triggerRelationsReload();
        return;
      }
      if (!isMd(file.path)) return;
      const type = kind === "delete" ? undefined : fmType(file);
      const isRelNow = isRel(file.path, type);
      if (isRelNow) this.knownRelationNotes.add(file.path);
      const wasRel = kind === "delete" && this.knownRelationNotes.has(file.path);
      if (isRelNow || wasRel || kind === "create" || (kind !== "delete" && checkLinks(file))) {
        this.triggerRelationsReload();
      }
      if (kind === "delete") {
        this.knownRelationNotes.delete(file.path);
        if (this.notesWithLinks.has(file.path)) {
          this.notesWithLinks.delete(file.path);
          this.triggerRelationsReload();
        }
        this.triggerVaultRescan({ kind: "delete", path: file.path });
      } else if (kind === "create") {
        this.triggerVaultRescan({ kind: "create", path: file.path });
      } else {
        this.triggerVaultRescan({ kind: "upsert", path: file.path });
      }
    };

    const handleRenameEvent = (file: { path: string }, oldPath: string) => {
      invalidateNoteKeys(this.app);
      if (isVocabulary(file?.path) || isVocabulary(oldPath)) {
        this.triggerRelationsReload();
        return;
      }
      const isFileMd = Boolean(file?.path?.endsWith(".md") || oldPath?.endsWith(".md"));
      if (!isFileMd) {
        const prefix = file.path.endsWith("/") ? file.path : file.path + "/";
        const oldPrefix = oldPath.endsWith("/") ? oldPath : oldPath + "/";
        const allFiles = this.app.vault.getMarkdownFiles?.() ?? [];
        let anyDescendant = false;
        for (const child of allFiles) {
          if (child.path.startsWith(prefix)) {
            const oldChildPath = oldPrefix + child.path.slice(prefix.length);
            handleRenameEvent(child, oldChildPath);
            anyDescendant = true;
          }
        }
        if (anyDescendant) return;
        return;
      }
      const type = fmType(file);
      const wasRel = this.knownRelationNotes.has(oldPath) || isRel(oldPath);
      const isRelNow = isRel(file.path, type);
      if (wasRel) this.knownRelationNotes.delete(oldPath);
      if (isRelNow) this.knownRelationNotes.add(file.path);

      const toFileInfo = (p: string) => {
        const name = p.split("/").pop() || p;
        return { path: p, name, basename: name.replace(/\.[^.]+$/, "") };
      };
      const exclusions = this.getSettings().vectorSearchExclusions;
      const wasExcluded = !shouldIncludeFile(toFileInfo(oldPath), exclusions);
      const isExcludedNow = !shouldIncludeFile(toFileInfo(file.path), exclusions);
      const crossedExclusionBoundary = wasExcluded !== isExcludedNow;

      if (wasRel || isRelNow || crossedExclusionBoundary || checkLinks(file) || this.notesWithLinks.has(oldPath)) {
        this.notesWithLinks.delete(oldPath);
        this.triggerRelationsReload();
      }
      this.triggerVaultRescan({ kind: "rename", path: file.path, oldPath });
    };

    component.registerEvent(this.app.vault.on("create", (file) => handleFileEvent(file, "create")));
    component.registerEvent(this.app.vault.on("modify", (file) => handleFileEvent(file, "modify")));
    component.registerEvent(this.app.vault.on("delete", (file) => handleFileEvent(file, "delete")));
    component.registerEvent(this.app.vault.on("rename", (file, oldPath) => handleRenameEvent(file, oldPath)));

    if (this.app.metadataCache?.on) {
      component.registerEvent(this.app.metadataCache.on("resolved", () => invalidateNoteKeys(this.app)));
      component.registerEvent(
        this.app.metadataCache.on("changed", (file, _data, cache) => {
          // A note that gains, loses or changes its frontmatter id changes its key (ADR-0007); its modify event queues
          // the move, and edges drawn to the old key are reloaded.
          invalidateNoteKeys(this.app);
          const key = noteKey(this.app, file.path);
          const keyBefore = this.seenKeys.get(file.path);
          this.seenKeys.set(file.path, key);
          if (keyBefore !== undefined && keyBefore !== key) this.triggerRelationsReload();
          const type = typeof cache?.frontmatter?.type === "string" ? cache.frontmatter.type : undefined;
          const isRelNow = isRel(file.path, type);
          const wasRel = this.knownRelationNotes.has(file.path);
          if (isRelNow) this.knownRelationNotes.add(file.path);
          else if (wasRel) this.knownRelationNotes.delete(file.path);

          const hadLinks = this.notesWithLinks.has(file.path);
          const hasLinksNow = hasLinkKeys(cache?.frontmatter, linkKeys());
          if (hasLinksNow) this.notesWithLinks.add(file.path);
          else if (hadLinks) this.notesWithLinks.delete(file.path);

          if (isRelNow !== wasRel || hasLinksNow || hadLinks) {
            this.triggerRelationsReload();
          }
        })
      );
    }
  }

  /** Queues a reload of relation edges and vocabulary forces. */
  triggerRelationsReload(): void {
    void this.refreshVocabLabels();
    this.queue.relationsChanged();
  }

  /** Queues one note change, or a background full rescan when no change is given. */
  triggerVaultRescan(change?: VaultNoteChange): void {
    if (!change) this.queue.fullScanRequested();
    else if (change.kind === "rename") this.queue.noteRenamed(change.oldPath, change.path);
    else if (change.kind === "delete") this.queue.noteDeleted(change.path);
    else if (change.kind === "create") this.queue.noteCreated(change.path);
    else this.queue.noteChanged(change.path);
  }

  /** Serializes pipeline tasks so incremental runs do not race. */
  private runExclusive(task: () => Promise<void>): Promise<void> {
    if (this.isDisposed) return Promise.resolve();
    const run = this.workChain.then(async () => {
      if (this.isDisposed) return;
      await task();
    });
    this.workChain = run.catch(() => undefined);
    return run;
  }

  /** Awaits any currently in-flight background pipeline work. */
  async settle(): Promise<void> {
    await this.workChain;
  }

  private processQueue(): void {
    const changes = this.queue.take();
    // 1. Immediately deliver view updates so scatter views react without waiting for network requests. Notes of a
    // duplicated id can change key without an event of their own (#279): views re-read them too.
    const duplicates = changes.fullScan ? [] : duplicateIdPaths(this.app).filter((p) => !changes.removals.has(p));
    this.notifySubscribers(duplicates.length > 0 ? { ...changes, upserts: new Set([...changes.upserts, ...duplicates]) } : changes);

    const settings = this.getSettings();
    if (settings.autoIndexVaultOnChanges) {
      void this.runExclusive(async () => {
        const currentSettings = this.getSettings();
        if (!currentSettings.autoIndexVaultOnChanges || this.isDisposed) return;
        try {
          const result = await this.indexChanges(changes, currentSettings);
          if (result && !this.isDisposed && this.getSettings().autoIndexVaultOnChanges) {
            if (result.fullScanCompleted) {
              // Post-index refresh for full scans so open views hydrate freshly calculated embeddings
              this.notifySubscribers({
                ...emptyChanges(),
                fullScan: true,
              });
            } else if (result.updatedVectors.size > 0) {
              // 2. Deliver secondary notification so views can pick up freshly computed vectors
              this.notifySubscribers({
                ...emptyChanges(),
                upserts: result.updatedVectors,
                modified: result.updatedVectors,
              });
            }
          }
        } catch (err) {
          console.warn("MemVector: Background incremental indexing failed at:", new Error(String(err)).stack);
        }
      });
    }
  }

  private notifySubscribers(changes: PendingVaultChanges): void {
    for (const sub of this.subscribers) {
      try {
        sub(changes);
      } catch (err) {
        console.warn("MemVector: Error in vault indexing pipeline subscriber:", err);
      }
    }
  }

  /**
   * Purpose: Incremental indexing of vault changes into local SQLite stores.
   * Architecture: Handles full rescan, renames (moving existing vectors without re-embedding), deletions,
   * and upserts (with content hash checks to bound embedding API calls).
   */
  async indexChanges(
    changes: PendingVaultChanges,
    settings: MemVectorSettings
  ): Promise<{ updatedVectors: Set<string>; fullScanCompleted?: boolean } | null> {
    if (this.isDisposed || !this.getSettings().autoIndexVaultOnChanges) return null;
    const target = resolveEmbeddingTarget(settings);
    const apiKey = resolveEmbeddingApiKey(this.app, settings);
    const vectorStore = getVectorStore(this.app, settings);
    const graphStore = getGraphStore(this.app, settings);
    const updatedVectors = new Set<string>();

    if (changes.fullScan) {
      const isCancelled = () => this.isDisposed || !this.getSettings().autoIndexVaultOnChanges;
      await migrateVaultNoteKeys(this.app, settings.vectorSearchExclusions);
      try {
        await syncVaultVectors(this.app, settings, vectorStore, { isCancelled });
      } catch (err) {
        if (isCancelled() || (err instanceof EmbeddingAbortedError && err.message === "cancelled")) {
          return null;
        }
        throw err;
      }
      if (isCancelled()) return null;
      await syncVaultGraph(
        this.app,
        graphStore,
        settings.vectorSearchExclusions,
        settings.includeWikiLinksAsRelations,
        relationsFolder(settings),
        await readRelationLabels(this.app, settings)
      );
      if (isCancelled()) return null;
      try {
        await reconcileNodePositionsWithVault(this.app, settings.vectorSearchExclusions);
      } catch (err) {
        console.warn("MemVector: Failed to remove stored positions of deleted or excluded notes:", err);
      }
      if (isCancelled()) return null;
      return { updatedVectors, fullScanCompleted: true };
    }

    // 0. A note that lost a duplicated id (#279) first moves its rows to its path key, so a renamed note that takes the
    // id below does not overwrite them (the moves delete rows already stored under the destination key)
    const renamedPaths = new Set([...changes.renamedFrom.keys(), ...changes.renamedFrom.values()]);
    const lostOwners = lostDuplicateIdPaths(this.app)
      .filter((p) => !renamedPaths.has(p))
      .map((p) => this.app.vault.getAbstractFileByPath(p))
      .filter((f): f is TFile => f instanceof TFile && shouldIncludeFile(f, settings.vectorSearchExclusions));
    if (changes.renamedFrom.size > 0 && lostOwners.length > 0) {
      await migrateVaultNoteKeys(this.app, settings.vectorSearchExclusions, lostOwners);
    }

    // 1. Process Renames: move existing vectors, node positions, and graph nodes without re-embedding
    const renamedOldPaths = new Set<string>();
    const movedVectorPaths = new Set<string>();
    for (const [newPath, oldPath] of changes.renamedFrom.entries()) {
      renamedOldPaths.add(oldPath);
      const isMd = newPath.endsWith(".md");
      const file = this.app.vault.getAbstractFileByPath(newPath);
      const isFile = file instanceof TFile;
      const isExcluded = !isMd || (isFile ? !shouldIncludeFile(file, settings.vectorSearchExclusions) : false);

      if (isExcluded) {
        await vectorStore.deleteVector?.(oldPath);
        await deleteNodePosition(this.app, oldPath);
        await graphStore.deleteNote?.(oldPath);
      } else {
        const newTitle = isFile ? file.basename : newPath.replace(/^.*\//, "").replace(/\.md$/, "");
        const vectorMoved = await vectorStore.moveVector?.(oldPath, newPath, newTitle);
        await moveNodePosition(this.app, oldPath, newPath);
        await graphStore.moveNote?.(oldPath, newPath, newTitle);
        if (vectorMoved) {
          movedVectorPaths.add(newPath);
        }
        if (isFile && settings.includeWikiLinksAsRelations) {
          const cache = this.app.metadataCache?.getFileCache(file);
          const targetIds: string[] = [];
          for (const link of cache?.links ?? []) {
            const rawLink = link.link.split("#")[0].trim();
            if (!rawLink) continue;
            const destFile = this.app.metadataCache?.getFirstLinkpathDest(rawLink, file.path);
            if (destFile && !shouldIncludeFile(destFile, settings.vectorSearchExclusions)) continue;
            const targetId = destFile ? noteKey(this.app, destFile.path) : toSlug(rawLink.split("/").pop() || rawLink);
            if (targetId) targetIds.push(targetId);
          }
          await graphStore.replaceOutgoingWikiLinks?.(noteKey(this.app, newPath), targetIds);
        }
      }
    }

    // 2. Process Deletions: purge removed notes from vector, position, and graph tables
    const pureDeletions = Array.from(changes.removals).filter((p) => !renamedOldPaths.has(p));
    for (const path of pureDeletions) {
      await vectorStore.deleteVector?.(path);
      await deleteNodePosition(this.app, path);
      await graphStore.deleteNote?.(path);
    }

    // 3. Move rows of changed notes whose key changed (gained, lost or changed frontmatter id; ADR-0007)
    const changedNotes = [...new Set([...changes.upserts, ...duplicateIdPaths(this.app)])]
      .map((p) => this.app.vault.getAbstractFileByPath(p))
      .filter((f): f is TFile => f instanceof TFile && f.path.endsWith(".md") && shouldIncludeFile(f, settings.vectorSearchExclusions));
    await migrateVaultNoteKeys(this.app, settings.vectorSearchExclusions, changedNotes);

    // 4. Process Upserts: creates and modifications
    const storedHashes = await vectorStore.getStoredHashes();

    for (const path of changes.upserts) {
      if (this.isDisposed || !this.getSettings().autoIndexVaultOnChanges) return null;
      const isPureRename = movedVectorPaths.has(path) && !changes.modified?.has(path);
      if (embeddingTargetChanged(this.getSettings(), target.fingerprint)) break;

      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !file.path.endsWith(".md")) continue;
      if (!shouldIncludeFile(file, settings.vectorSearchExclusions)) continue;

      if (!isPureRename) {
        const content = await this.app.vault.cachedRead(file);
        const { text, hash, body } = buildEmbeddingInput(file.basename, content, settings.embeddingMaxChars, parseEmbeddingFrontmatterKeys(settings.embeddingFrontmatterKeys));

        const cached = storedHashes.get(path) ?? storedHashes.get(noteKey(this.app, path));
        if (!cached || cached.hash !== hash) {
          if (this.isDisposed || !this.getSettings().autoIndexVaultOnChanges || embeddingTargetChanged(this.getSettings(), target.fingerprint)) break;
          try {
            const { embedding, error } = await fetchEmbedding(text, target.apiBase, apiKey, target.model);
            if (this.isDisposed || !this.getSettings().autoIndexVaultOnChanges || embeddingTargetChanged(this.getSettings(), target.fingerprint)) break;
            if (error || !embedding || embedding.length === 0) {
              console.warn(`MemVector: Background embedding failed for ${path}:`, error);
            } else {
              await vectorStore.syncPoints([
                {
                  id: noteKey(this.app, path),
                  vector: embedding,
                  payload: { path, title: file.basename, content: body.slice(0, 500) },
                  contentHash: hash,
                  mtime: file.stat?.mtime,
                },
              ]);
              updatedVectors.add(path);
            }
          } catch (err) {
            console.warn(`MemVector: Background embedding error for ${path}:`, err);
          }
        }
      }

      if (this.isDisposed) return null;

      // Upsert graph node
      const nodeId = noteKey(this.app, path);
      await graphStore.upsertNoteNode?.({
        id: nodeId,
        title: file.basename,
        path: file.path,
      });

      // If WikiLinks as relations is active, update outgoing links and restore incoming links
      if (settings.includeWikiLinksAsRelations) {
        const cache = this.app.metadataCache?.getFileCache(file);
        const targetIds: string[] = [];
        for (const link of cache?.links ?? []) {
          const rawLink = link.link.split("#")[0].trim();
          if (!rawLink) continue;
          const destFile = this.app.metadataCache?.getFirstLinkpathDest(rawLink, file.path);
          if (destFile && !shouldIncludeFile(destFile, settings.vectorSearchExclusions)) continue;
          const targetId = destFile ? noteKey(this.app, destFile.path) : toSlug(rawLink.split("/").pop() || rawLink);
          if (targetId) targetIds.push(targetId);
        }
        await graphStore.replaceOutgoingWikiLinks?.(nodeId, targetIds);

        // Restore incoming WikiLinks from notes pointing to this newly created/recreated note
        if (changes.created?.has(path)) {
          const resolved = this.app.metadataCache?.resolvedLinks;
          if (resolved) {
            for (const [srcPath, targets] of Object.entries(resolved)) {
              if (targets[file.path]) {
                const srcFile = this.app.vault.getAbstractFileByPath(srcPath);
                if (srcFile instanceof TFile && shouldIncludeFile(srcFile, settings.vectorSearchExclusions)) {
                  const srcCache = this.app.metadataCache?.getFileCache(srcFile);
                  const srcTargetIds: string[] = [];
                  for (const link of srcCache?.links ?? []) {
                    const rawLink = link.link.split("#")[0].trim();
                    if (!rawLink) continue;
                    const destFile = this.app.metadataCache?.getFirstLinkpathDest(rawLink, srcFile.path);
                    if (destFile && !shouldIncludeFile(destFile, settings.vectorSearchExclusions)) continue;
                    const targetId = destFile ? noteKey(this.app, destFile.path) : toSlug(rawLink.split("/").pop() || rawLink);
                    if (targetId) srcTargetIds.push(targetId);
                  }
                  await graphStore.replaceOutgoingWikiLinks?.(noteKey(this.app, srcFile.path), srcTargetIds);
                }
              }
            }
          } else {
            const targetSlug = toSlug(file.basename);
            for (const otherFile of this.app.vault.getMarkdownFiles?.() ?? []) {
              if (otherFile.path === file.path) continue;
              if (!shouldIncludeFile(otherFile, settings.vectorSearchExclusions)) continue;
              const otherCache = this.app.metadataCache?.getFileCache(otherFile);
              const otherLinks = otherCache?.links ?? [];
              const hasLinkToTarget = otherLinks.some((l) => {
                const raw = l.link.split("#")[0].trim();
                const dest = this.app.metadataCache?.getFirstLinkpathDest(raw, otherFile.path);
                return dest?.path === file.path || toSlug(raw.split("/").pop() || raw) === targetSlug;
              });
              if (hasLinkToTarget) {
                const otherTargetIds: string[] = [];
                for (const link of otherLinks) {
                  const rawLink = link.link.split("#")[0].trim();
                  if (!rawLink) continue;
                  const destFile = this.app.metadataCache?.getFirstLinkpathDest(rawLink, otherFile.path);
                  if (destFile && !shouldIncludeFile(destFile, settings.vectorSearchExclusions)) continue;
                  const targetId = destFile ? noteKey(this.app, destFile.path) : toSlug(rawLink.split("/").pop() || rawLink);
                  if (targetId) otherTargetIds.push(targetId);
                }
                await graphStore.replaceOutgoingWikiLinks?.(noteKey(this.app, otherFile.path), otherTargetIds);
              }
            }
          }
        }
      }
    }

    // 5. Reload relation edges if relations or vocabulary changed
    if (changes.relations && !this.isDisposed) {
      try {
        const labels = await readRelationLabels(this.app, settings);
        await syncVaultGraph(
          this.app,
          graphStore,
          settings.vectorSearchExclusions,
          settings.includeWikiLinksAsRelations,
          relationsFolder(settings),
          labels
        );
      } catch (err) {
        console.warn("MemVector: Background relation sync failed:", err);
      }
    }

    if (this.isDisposed) return null;
    await vectorStore.flush();
    return { updatedVectors };
  }

  dispose(): void {
    this.isDisposed = true;
    this.queue.dispose();
    this.subscribers.clear();
  }
}
