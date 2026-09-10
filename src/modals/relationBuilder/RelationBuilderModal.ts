import { Modal, Notice, TFile, type App } from "obsidian";
import { getTranslation } from "../../i18n";
import { getGraphStore } from "../../sync/storeFactory";
import type { SettingsHost } from "../../settings/types";
import { loadRelationVocabulary } from "../../relationVocabulary/loadRelationVocabulary";
import { buildRelationCategories, type RelationCategory } from "../../relationVocabulary/buildCategories";
import { defaultTermForLabel, resolveEdgesForSave } from "../../relationVocabulary/resolveTerm";
import type { RelationTermDef } from "../../relationVocabulary/types";
import { generateEdges, type EdgeTopology, type RelationEdgeDraft, type RelationNode } from "./relationEdgeBuilder";
import { buildRelationCypherPreview } from "./relationCypherPreview";
import { buildRelationFileContent, relationFilePath } from "./relationFileTemplate";
import { writeRelationFile } from "./relationFileWriter";

export interface InitialRelationEdge {
  relType: string;
  description: string;
  path: string;
  srcId?: string;
  tgtId?: string;
}

export class RelationBuilderModal extends Modal {
  private focalIndex = 0;
  private topology: EdgeTopology = "FOCAL_TO_REST";
  private relType = "";
  private edgeRelTypes: Record<number, string> = {};
  private relDesc = "";
  /** True when editing an edge whose stored label isn't in the current vocabulary - the dropdown falls back to "Custom" with the raw label pre-filled instead of silently remapping it. */
  private isCustomFallback = false;

  constructor(
    app: App,
    private readonly host: SettingsHost,
    private selectedNodes: RelationNode[],
    private readonly initialEdge?: InitialRelationEdge,
    private readonly onSaved?: () => void
  ) {
    super(app);
    if (initialEdge) this.relDesc = initialEdge.description;
  }

  onOpen(): void {
    this.modalEl.addClass("memvector-relation-modal");

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memvector-relation-content");
    const lang = this.host.settings.language || "de";
    const t = getTranslation(lang);
    contentEl.createEl("p", { text: t.relLoadingVocabulary, cls: "memvector-muted-text" });

    void loadRelationVocabulary(this.app, this.host.settings).then((defs) => {
      if (!this.relType) this.relType = defs[0]?.key || "CUSTOM";
      if (this.initialEdge) {
        const termKey = defaultTermForLabel(defs, this.initialEdge.relType);
        if (termKey) {
          this.relType = termKey;
          this.edgeRelTypes[0] = termKey;
        } else {
          this.relType = this.initialEdge.relType;
          this.isCustomFallback = true;
          this.edgeRelTypes[0] = "CUSTOM";
        }
      }
      this.renderBody(defs);
    });
  }

  private renderBody(defs: RelationTermDef[]): void {
    const { contentEl } = this;
    contentEl.empty();

    const lang = this.host.settings.language || "de";
    const t = getTranslation(lang);
    const count = this.selectedNodes.length;
    const categories = buildRelationCategories(defs, t.relCustom);

    this.renderHeader(contentEl, t, count);

    const flowCard = contentEl.createDiv({ cls: "memvector-flow-card" });
    const flowHeader = flowCard.createDiv({ cls: "memvector-flow-header" });
    flowHeader.createSpan({ text: t.relFlowPreview, cls: "memvector-flow-title" });
    const swapBtn = flowHeader.createEl("button", {
      text: t.relSwapDirection,
      cls: "memvector-flow-swap-btn",
    });
    const flowBody = flowCard.createDiv({ cls: "memvector-relation-flow-body" });
    const customInput = flowCard.createEl("input", {
      type: "text",
      placeholder: t.relCustomPlaceholder,
      cls: "memvector-relation-custom-input",
    });
    if (this.isCustomFallback) {
      customInput.addClass("is-visible");
      customInput.value = this.relType;
    }

    const step1 = contentEl.createDiv({ cls: "memvector-relation-step" });
    step1.createDiv({ text: t.relTopologyTitle, cls: "memvector-relation-step-title" });
    const topolRow = step1.createDiv({ cls: "memvector-topol-row" });
    const focalWrap = step1.createDiv({ cls: "memvector-focal-wrap" });

    const step2 = contentEl.createDiv({ cls: "memvector-relation-step" });
    step2.createDiv({ text: t.relDescTitle, cls: "memvector-relation-step-title" });
    const descArea = step2.createEl("textarea", {
      placeholder: t.relDescPlaceholder,
      cls: "memvector-relation-desc-area",
    });
    descArea.value = this.relDesc;

    const details = contentEl.createEl("details", { cls: "memvector-relation-details" });
    details.createEl("summary", { text: t.relCypherSummary, cls: "memvector-cypher-summary" });
    const cypherBox = details.createEl("pre", { cls: "memvector-cypher-box" });

    const generate = (): RelationEdgeDraft[] => generateEdges(this.selectedNodes, this.topology, this.focalIndex);

    const updateCypherPreview = () => {
      const resolved = resolveEdgesForSave(defs, generate(), this.edgeRelTypes, this.relType);
      cypherBox.setText(buildRelationCypherPreview(resolved, this.relDesc));
    };

    const createSingleDropdown = (parent: HTMLElement, edgeIdx: number): HTMLSelectElement => {
      const currentVal = this.edgeRelTypes[edgeIdx] || this.relType;
      const select = parent.createEl("select", {
        attr: { style: "font-size: 0.78em; font-weight: 600; padding: 4px 6px; border-radius: 4px; background: var(--background-secondary); color: var(--interactive-accent, #38bdf8); border: 1px solid rgba(56, 189, 248, 0.3); cursor: pointer; min-width: 0; width: auto; max-width: 140px; text-align: center;" },
      });
      categories.forEach((cat: RelationCategory) => {
        const group = select.createEl("optgroup", { attr: { label: cat.name } });
        cat.items.forEach((item) => {
          const opt = group.createEl("option", { text: item.label, value: item.val });
          if (item.val === currentVal) opt.selected = true;
        });
      });
      select.onchange = () => {
        this.edgeRelTypes[edgeIdx] = select.value;
        customInput.style.display = select.value === "CUSTOM" ? "block" : "none";
        updateFlowPreview();
        updateCypherPreview();
      };
      return select;
    };

    const updateFlowPreview = () => {
      flowBody.empty();
      const edges = generate();

      if (count > 2) {
        const masterRow = flowBody.createDiv({
          attr: { style: "display: flex; align-items: center; gap: 12px; padding: 8px 14px; margin-bottom: 6px; background: var(--background-primary); border-radius: 6px; border: 1px dashed rgba(56, 189, 248, 0.25);" },
        });
        masterRow.createSpan({ text: t.relBulkChange, attr: { style: "font-size: 0.78em; font-weight: 600; color: var(--text-muted); flex-shrink: 0;" } });
        const masterSelect = masterRow.createEl("select", {
          attr: { style: "font-size: 0.78em; font-weight: 600; padding: 4px 8px; border-radius: 4px; background: var(--background-secondary); color: var(--interactive-accent); border: 1px solid rgba(56, 189, 248, 0.3); flex: 1; max-width: 200px;" },
        });
        categories.forEach((cat) => {
          const group = masterSelect.createEl("optgroup", { attr: { label: cat.name } });
          cat.items.forEach((item) => {
            const opt = group.createEl("option", { text: item.label, value: item.val });
            if (item.val === this.relType) opt.selected = true;
          });
        });
        masterSelect.onchange = () => {
          this.relType = masterSelect.value;
          edges.forEach((_, idx) => {
            this.edgeRelTypes[idx] = masterSelect.value;
          });
          updateFlowPreview();
          updateCypherPreview();
        };
      }

      const listEl = flowBody.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 4px;" } });
      edges.forEach((e, idx) => {
        this.renderEdgeRow(listEl, e, idx, createSingleDropdown);
      });
    };

    customInput.oninput = () => {
      this.relType = customInput.value.toUpperCase().replace(/\s+/g, "_") || "RELATED_TO";
      updateFlowPreview();
      updateCypherPreview();
    };

    swapBtn.onclick = () => {
      if (this.topology === "FOCAL_TO_REST") this.topology = "REST_TO_FOCAL";
      else if (this.topology === "REST_TO_FOCAL") this.topology = "FOCAL_TO_REST";
      else this.selectedNodes.reverse();
      topolBtns.forEach((b) => b.update());
      updateFlowPreview();
      updateCypherPreview();
    };

    const topologies: { id: EdgeTopology; label: string }[] = [
      { id: "FOCAL_TO_REST", label: t.relTopoFocalToRest },
      { id: "REST_TO_FOCAL", label: t.relTopoRestToFocal },
      { id: "CHAIN", label: t.relTopoChain },
    ];
    const topolBtns: (HTMLButtonElement & { update: () => void })[] = [];
    topologies.forEach((topo) => {
      const btn = topolRow.createEl("button", { text: topo.label }) as HTMLButtonElement & { update: () => void };
      Object.assign(btn.style, { flex: "1", fontSize: "0.8em", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", transition: "all 0.15s ease" });
      const updateStyle = () => {
        const isActive = this.topology === topo.id;
        btn.style.background = isActive ? "var(--interactive-accent, #38bdf8)" : "var(--background-primary)";
        btn.style.color = isActive ? "#ffffff" : "var(--text-muted)";
        btn.style.border = isActive ? "1px solid var(--interactive-accent)" : "1px solid var(--background-modifier-border)";
      };
      btn.onclick = () => {
        this.topology = topo.id;
        topolBtns.forEach((b) => b.update());
        focalWrap.style.display = this.topology === "CHAIN" ? "none" : "flex";
        updateFlowPreview();
        updateCypherPreview();
      };
      btn.update = updateStyle;
      updateStyle();
      topolBtns.push(btn);
    });

    focalWrap.createSpan({ text: t.relFocalNote, attr: { style: "font-size: 0.85em; font-weight: 600; color: var(--text-normal); white-space: nowrap;" } });
    const focalSelect = focalWrap.createEl("select", {
      attr: { style: "flex: 1; padding: 6px 12px; font-size: 0.85em; border-radius: 6px; background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);" },
    });
    this.selectedNodes.forEach((n, idx) => {
      const opt = focalSelect.createEl("option", { text: `[${n.type.toUpperCase()}] ${n.title}`, value: String(idx) });
      if (idx === this.focalIndex) opt.selected = true;
    });
    focalSelect.onchange = () => {
      this.focalIndex = parseInt(focalSelect.value, 10) || 0;
      updateFlowPreview();
      updateCypherPreview();
    };
    focalWrap.hidden = this.topology === "CHAIN";

    descArea.oninput = () => {
      this.relDesc = descArea.value;
      updateCypherPreview();
    };

    updateFlowPreview();
    updateCypherPreview();

    this.renderFooter(contentEl, t, defs, generate);
  }

  private renderHeader(contentEl: HTMLElement, t: ReturnType<typeof getTranslation>, count: number): void {
    const headerRow = contentEl.createDiv({ cls: "memvector-relation-header-row" });
    const headerLeft = headerRow.createDiv({ cls: "memvector-relation-header-left" });
    headerLeft.createDiv({ cls: "memvector-relation-header-dot" });
    headerLeft.createEl("h3", {
      text: this.initialEdge ? t.relModalEditTitle : t.relModalTitle,
      cls: "memvector-relation-header-title",
    });
    headerRow.createSpan({
      text: `${count} ${t.relNotesSelected}`,
      cls: "memvector-relation-badge",
    });
  }

  private renderEdgeRow(
    listEl: HTMLElement,
    e: RelationEdgeDraft,
    idx: number,
    createSingleDropdown: (parent: HTMLElement, edgeIdx: number) => HTMLSelectElement
  ): void {
    const cleanSrc = e.src.title.replace(/[\r\n]+/g, " ").trim();
    const cleanTgt = e.tgt.title.replace(/[\r\n]+/g, " ").trim();

    const row = listEl.createDiv({ cls: "memvector-relation-edge-row" });
    row.style.borderLeft = `3px solid ${idx % 2 === 0 ? "rgba(56, 189, 248, 0.5)" : "rgba(16, 185, 129, 0.5)"}`;

    const srcDiv = row.createDiv({ cls: "memvector-relation-node-src" });
    srcDiv.title = cleanSrc;
    srcDiv.textContent = cleanSrc;

    const center = row.createDiv({ cls: "memvector-relation-node-center" });
    center.createSpan({ cls: "memvector-relation-arrow", text: "→" });
    createSingleDropdown(center, idx);
    center.createSpan({ cls: "memvector-relation-arrow", text: "→" });

    const tgtDiv = row.createDiv({ cls: "memvector-relation-node-tgt" });
    tgtDiv.title = cleanTgt;
    tgtDiv.textContent = cleanTgt;
  }

  private renderFooter(contentEl: HTMLElement, t: ReturnType<typeof getTranslation>, defs: RelationTermDef[], generate: () => RelationEdgeDraft[]): void {
    const btnRow = contentEl.createDiv({ cls: "memvector-relation-footer" });
    this.renderDeleteButton(btnRow, t);
    const cancelBtn = btnRow.createEl("button", { text: t.relCancelBtn });
    cancelBtn.onclick = () => this.close();

    const saveBtn = btnRow.createEl("button", {
      text: t.relSaveBtn,
      cls: "memvector-relation-save-btn",
    });

    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.setText(t.relSaving);

      const resolvedEdges = resolveEdgesForSave(defs, generate(), this.edgeRelTypes, this.relType);
      let createdCount = 0;
      const typedEdges: { src: RelationNode; tgt: RelationNode; relType: string; description: string; bidirectional: boolean; originalTerm: string }[] = [];

      // If updating an existing edge, delete the old edge from SQLite so we don't leave stale duplicate edges
      if (this.initialEdge) {
        const oldSrc = (this.initialEdge.srcId || this.selectedNodes[0]?.id || "").toLowerCase();
        const oldTgt = (this.initialEdge.tgtId || this.selectedNodes[1]?.id || "").toLowerCase();
        const oldType = this.initialEdge.relType;
        if (oldSrc && oldTgt && oldType) {
          try {
            const store = getGraphStore(this.app, this.host.settings);
            await store.deleteEdge(oldSrc, oldTgt, oldType);
            await store.deleteEdge(oldTgt, oldSrc, oldType);
          } catch (err) {
            console.warn("MemVector: Failed to delete old SQLite edge during update:", err);
          }
        }
      }

      for (let idx = 0; idx < resolvedEdges.length; idx++) {
        const e = resolvedEdges[idx];
        let targetPath: string;

        if (this.initialEdge && idx === 0) {
          const oldSrc = (this.initialEdge.srcId || this.selectedNodes[0]?.id || "").toLowerCase();
          const isDirectionPreserved = e.src.id.toLowerCase() === oldSrc;

          if (isDirectionPreserved) {
            // Update the existing relation file in-place to avoid duplicate files
            targetPath = this.initialEdge.path;
          } else {
            // Direction was swapped: write to new path and trash the old file
            targetPath = relationFilePath(e);
            if (targetPath !== this.initialEdge.path) {
              const oldFile = this.app.vault.getAbstractFileByPath(this.initialEdge.path);
              if (oldFile instanceof TFile) {
                try {
                  await this.app.fileManager.trashFile(oldFile);
                } catch (trashErr) {
                  console.warn("MemVector: Could not trash old relation file on direction swap:", trashErr);
                }
              }
            }
          }
        } else {
          targetPath = relationFilePath(e);
        }

        const content = buildRelationFileContent(e, this.relDesc, t);
        try {
          await writeRelationFile(this.app, targetPath, content);
          createdCount++;
          typedEdges.push({ src: e.src, tgt: e.tgt, relType: e.label, description: this.relDesc, bidirectional: e.bidirectional, originalTerm: e.originalTerm });
        } catch (err) {
          console.error(`${t.relSaveError} ${targetPath}:`, err);
        }
      }

      new Notice(`${createdCount} ${t.relSaveSuccess}`);

      if (typedEdges.length > 0) {
        try {
          await getGraphStore(this.app, this.host.settings).upsertTypedEdges(typedEdges);
        } catch (err) {
          console.error("SQLite Graph Fehler:", err);
        }
      }

      this.onSaved?.();
      this.close();
    };
  }

  private renderDeleteButton(btnRow: HTMLElement, t: ReturnType<typeof getTranslation>): void {
    if (!this.initialEdge) return;
    const initialEdge = this.initialEdge;

    const deleteBtn = btnRow.createEl("button", {
      text: t.relDeleteBtn,
      cls: "memvector-relation-delete-btn",
    });
    let confirmPending = false;

    deleteBtn.onclick = async () => {
      if (!confirmPending) {
        confirmPending = true;
        deleteBtn.setText(`${t.relDeleteBtn}?`);
        return;
      }
      deleteBtn.disabled = true;
      deleteBtn.setText(t.relDeleting);

      const file = this.app.vault.getAbstractFileByPath(initialEdge.path);
      if (file instanceof TFile) {
        try {
          await this.app.fileManager.trashFile(file);
        } catch (err) {
          console.error(`${t.relDeleteFileError} ${initialEdge.path}:`, err);
        }
      }

      const oldSrc = (initialEdge.srcId || this.selectedNodes[0]?.id || "").toLowerCase();
      const oldTgt = (initialEdge.tgtId || this.selectedNodes[1]?.id || "").toLowerCase();
      if (oldSrc && oldTgt) {
        try {
          const store = getGraphStore(this.app, this.host.settings);
          await store.deleteEdge(oldSrc, oldTgt, initialEdge.relType);
          await store.deleteEdge(oldTgt, oldSrc, initialEdge.relType);
        } catch (err) {
          console.error("Fehler beim Löschen der SQLite-Kante:", err);
        }
      }
      new Notice(`[OK] ${t.relDeleteSuccess}`);

      this.onSaved?.();
      this.close();
    };
  }
}
