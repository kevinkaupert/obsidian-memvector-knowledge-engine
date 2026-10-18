import { TFile, type App, type EventRef } from "obsidian";
import { relationsFolder, resolveVocabularyPath } from "../../vaultLayout";
import type { RelationTermDef } from "../../relationVocabulary/types";
import type { MemVectorSettings } from "../../settings/types";
import { buildLinkKeys, hasLinkKeys } from "../../frontmatterLinks";
import { isRelationNote } from "../../relationNotes";
import type { RelationEdge, ScatterNode } from "./types";
import { cachedFrontmatterType, fileRefFromPath, isInScanScope, type ScanScope } from "./vaultScan";
import type { VaultNoteChange } from "./vaultEventQueue";

/**
 * Purpose: What the vault watchers of a 2D view read and call. Every accessor is called at event time, because scans
 * replace the node and edge arrays and the vocabulary.
 * Architecture: Split out of VectorScatterView (#273); the view passes arrows bound to itself.
 */
export interface ScatterWatcherHost {
  app: App;
  settings(): MemVectorSettings;
  nodes(): ScatterNode[];
  relationEdges(): RelationEdge[];
  vocabulary(): RelationTermDef[];
  scanScope(): ScanScope;
  triggerRelationsReload(): void;
  triggerVaultRescan(change?: VaultNoteChange): void;
  registerEvent(ref: EventRef): void;
}

/**
 * Purpose: Registers reactive vault event watchers that feed the view's event queue.
 * Architecture: Only events that can change the view are queued: notes that are shown, or that the scan scope
 * (indexing exclusions, view filter, relation-note visibility) would show - a rename counts if either its old or
 * its new path qualifies. Relation notes and the vocabulary file always reload the edges, even outside the view
 * filter, because they change forces between shown notes; a relation note is additionally a node when relation
 * notes are shown. Relation notes are recognized by frontmatter, the relations folder, or - for deletes and the
 * old path of a rename, where no frontmatter is left - by the paths of the loaded relation edges.
 */
export function registerScatterVaultWatchers(host: ScatterWatcherHost): void {
  if (!host.app?.vault?.on) return;

  const isVocabulary = (p?: string) => Boolean(p && p === resolveVocabularyPath(host.settings()));
  const fmType = (file: { path: string }) => (file instanceof TFile ? cachedFrontmatterType(host.app, file) : undefined);
  // A deleted file has no frontmatter left, so a relation note outside the relations folder is only recognizable
  // by the paths of the relation edges loaded from it.
  const linkKeys = () => buildLinkKeys(host.vocabulary().map((t) => t.label));
  const isRel = (path: string, type?: string) =>
    isRelationNote(path, type, relationsFolder(host.settings())) || host.relationEdges().some((e) => e.path === path);
  // A note whose frontmatter carries typed-link keys contributes edges too (#243).
  const hasLinks = (file: { path: string }) =>
    file instanceof TFile && hasLinkKeys(host.app.metadataCache.getFileCache(file)?.frontmatter, linkKeys());
  const isMd = (p?: string) => Boolean(p && p.endsWith(".md"));
  const isShown = (path: string) => host.nodes().some((n) => n.path === path);
  const inScope = (path: string, type?: string) => isInScanScope(fileRefFromPath(path), type, host.scanScope());

  const handleFileEvent = (file: { path: string }, kind: "create" | "modify" | "delete") => {
    if (!file?.path) return;
    if (isVocabulary(file.path)) {
      host.triggerRelationsReload();
      return;
    }
    if (!isMd(file.path)) return;
    const type = kind === "delete" ? undefined : fmType(file);
    if (isRel(file.path, type) || (kind !== "delete" && hasLinks(file))) host.triggerRelationsReload();
    if (kind === "delete") {
      if (isShown(file.path)) host.triggerVaultRescan({ kind: "delete", path: file.path });
    } else if (isShown(file.path) || inScope(file.path, type)) {
      host.triggerVaultRescan({ kind: "upsert", path: file.path });
    }
  };

  const handleRenameEvent = (file: { path: string }, oldPath: string) => {
    if (isVocabulary(file?.path) || isVocabulary(oldPath)) {
      host.triggerRelationsReload();
      return;
    }
    if (!isMd(file?.path) && !isMd(oldPath)) return;
    const type = fmType(file);
    if (isRel(file.path, type) || isRel(oldPath) || hasLinks(file)) host.triggerRelationsReload();
    if (isShown(oldPath) || inScope(file.path, type)) {
      host.triggerVaultRescan({ kind: "rename", path: file.path, oldPath });
    }
  };

  host.registerEvent(host.app.vault.on("create", (file) => handleFileEvent(file, "create")));
  host.registerEvent(host.app.vault.on("modify", (file) => handleFileEvent(file, "modify")));
  host.registerEvent(host.app.vault.on("delete", (file) => handleFileEvent(file, "delete")));
  host.registerEvent(host.app.vault.on("rename", (file, oldPath) => handleRenameEvent(file, oldPath)));
  // `modify` can arrive before Obsidian re-parses the frontmatter; the parsed cache catches the first typed-link key
  // added to a note and the last one removed from it (#243).
  if (host.app.metadataCache?.on) {
    host.registerEvent(
      host.app.metadataCache.on("changed", (file, _data, cache) => {
        if (hasLinkKeys(cache?.frontmatter, linkKeys()) || host.relationEdges().some((e) => e.path === file.path)) {
          host.triggerRelationsReload();
        }
      })
    );
  }
}
