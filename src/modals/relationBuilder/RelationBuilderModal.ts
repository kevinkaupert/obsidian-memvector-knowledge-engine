import { Modal, Notice, TFile, type App } from "obsidian";
import { getTranslation } from "../../i18n";
import { enqueuePendingRelations } from "../../sync/memgraph/pendingRelationsQueue";
import { getGraphStore } from "../../sync/storeFactory";
import type { SettingsHost } from "../../settings/types";
import { loadRelationVocabulary } from "../../relationVocabulary/loadRelationVocabulary";
import { buildRelationCategories, type RelationCategory } from "../../relationVocabulary/buildCategories";
import { defaultTermForLabel, resolveEdgesForSave } from "../../relationVocabulary/resolveTerm";
import type { RelationTermDef } from "../../relationVocabulary/types";
import { requestEdgeSuggestion, requestEdgeVerification } from "../../relationVocabulary/llmSuggestRequest";
import { generateEdges, type EdgeTopology, type RelationEdgeDraft, type RelationNode } from "./relationEdgeBuilder";
import { buildRelationCypherPreview } from "./relationCypherPreview";
import { buildRelationFileContent, relationFilePath } from "./relationFileTemplate";
import { writeRelationFile } from "./relationFileWriter";

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
    private readonly initialEdge?: { relType: string; description: string; path: string },
    private readonly onSaved?: () => void
  ) {
    super(app);
    if (initialEdge) this.relDesc = initialEdge.description;
  }

  onOpen(): void {
    this.modalEl.style.width = "82vw";
    this.modalEl.style.maxWidth = "1100px";
    this.modalEl.style.minWidth = "400px";

    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.maxHeight = "90vh";
    contentEl.style.overflowY = "auto";
    contentEl.style.padding = "24px";
    const lang = this.host.settings.language || "de";
    const t = getTranslation(lang);
    contentEl.createEl("p", { text: t.relLoadingVocabulary, attr: { style: "color: var(--text-muted); font-size: 0.9em;" } });

    loadRelationVocabulary(this.app, this.host.settings).then((defs) => {
      if (!this.relType) this.relType = defs[0]?.key || "CUSTOM";
      if (this.initialEdge) {
        const termKey = defaultTermForLabel(defs, this.initialEdge.relType);
        if (termKey) {
          this.relType = termKey;
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

    const flowCard = contentEl.createEl("div", {
      attr: {
        style:
          "background: var(--background-secondary-alt, rgba(15, 23, 42, 0.7)); padding: 18px; border-radius: 8px; border: 1px solid var(--interactive-accent, #38bdf8); margin-bottom: 20px;",
      },
    });
    const flowHeader = flowCard.createEl("div", { attr: { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;" } });
    flowHeader.createEl("span", { text: t.relFlowPreview, attr: { style: "font-size: 0.75em; font-weight: 700; color: var(--interactive-accent, #38bdf8); letter-spacing: 0.06em;" } });
    const swapBtn = flowHeader.createEl("button", {
      text: t.relSwapDirection,
      attr: { style: "font-size: 0.78em; font-weight: 600; padding: 5px 14px; border-radius: 6px; cursor: pointer; background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--interactive-accent, #38bdf8);" },
    });
    const flowBody = flowCard.createEl("div", { attr: { style: "display: flex; flex-direction: column; gap: 10px;" } });
    const customInput = flowCard.createEl("input", {
      type: "text",
      placeholder: t.relCustomPlaceholder,
      attr: { style: "width: 100%; font-size: 0.82em; padding: 8px 12px; border-radius: 6px; background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); margin-top: 12px; display: none;" },
    }) as HTMLInputElement;
    if (this.isCustomFallback) {
      customInput.style.display = "block";
      customInput.value = this.relType;
    }

    const step1 = contentEl.createEl("div", {
      attr: { style: "background: var(--background-secondary, rgba(30, 41, 59, 0.4)); padding: 16px; border-radius: 8px; border: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.06)); margin-bottom: 20px;" },
    });
    step1.createEl("div", { text: t.relTopologyTitle, attr: { style: "font-size: 0.78em; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;" } });
    const topolRow = step1.createEl("div", { attr: { style: "display: flex; gap: 10px; margin-bottom: 12px;" } });
    const focalWrap = step1.createEl("div", { attr: { style: "margin-top: 12px; display: flex; align-items: center; gap: 12px;" } });

    const step2 = contentEl.createEl("div", {
      attr: { style: "background: var(--background-secondary, rgba(30, 41, 59, 0.4)); padding: 16px; border-radius: 8px; border: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.06)); margin-bottom: 20px;" },
    });
    step2.createEl("div", { text: t.relDescTitle, attr: { style: "font-size: 0.78em; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;" } });
    const descArea = step2.createEl("textarea", {
      placeholder: t.relDescPlaceholder,
      attr: { style: "width: 100%; box-sizing: border-box; min-height: 120px; font-size: 0.88em; padding: 12px 14px; border-radius: 6px; background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); resize: vertical;" },
    }) as HTMLTextAreaElement;
    descArea.value = this.relDesc;

    const details = contentEl.createEl("details", {
      attr: { style: "background: var(--background-secondary); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--background-modifier-border); margin-bottom: 20px; font-size: 0.82em;" },
    });
    details.createEl("summary", { text: t.relCypherSummary, attr: { style: "cursor: pointer; font-weight: 600; color: var(--interactive-accent);" } });
    const cypherBox = details.createEl("pre", {
      attr: { style: "background: var(--background-primary); color: var(--interactive-accent); padding: 12px; border-radius: 6px; font-family: var(--font-monospace); font-size: 0.8em; overflow-x: auto; white-space: pre-wrap; margin-top: 10px; border: 1px solid var(--background-modifier-border);" },
    });

    const generate = (): RelationEdgeDraft[] => generateEdges(this.selectedNodes, this.topology, this.focalIndex);

    const updateCypherPreview = () => {
      const resolved = resolveEdgesForSave(defs, generate(), this.edgeRelTypes, this.relType);
      cypherBox.setText(buildRelationCypherPreview(resolved, this.relDesc));
    };

    const createSingleDropdown = (parent: HTMLElement, edgeIdx: number, edge: RelationEdgeDraft): HTMLSelectElement => {
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

      const iconBtnStyle =
        "font-size: 0.78em; padding: 3px 6px; border-radius: 4px; cursor: pointer; background: var(--background-primary); border: 1px solid var(--background-modifier-border); flex-shrink: 0; line-height: 1;";

      const suggestBtn = parent.createEl("button", { text: "🔍", attr: { title: t.relSuggestType, style: iconBtnStyle } });
      suggestBtn.onclick = async () => {
        suggestBtn.disabled = true;
        suggestBtn.textContent = "⏳";
        try {
          const suggestion = await requestEdgeSuggestion(this.app, this.host.settings, defs, edge.src, edge.tgt);
          if (!suggestion) {
            new Notice(t.relSuggestNoResult);
            return;
          }
          const termKey = defaultTermForLabel(defs, suggestion.label);
          this.edgeRelTypes[edgeIdx] = termKey || "CUSTOM";
          if (!termKey) customInput.value = suggestion.label;
          if (!this.relDesc.trim() && suggestion.reason) {
            this.relDesc = suggestion.reason;
            descArea.value = suggestion.reason;
          }
          updateFlowPreview();
          updateCypherPreview();
          const cx = suggestion.counterexample ? ` ⚠️ ${suggestion.counterexample}` : "";
          new Notice(`💡 ${suggestion.label}: ${suggestion.reason}${cx}`);
        } catch (err) {
          new Notice(`❌ ${t.relSuggestError}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          suggestBtn.disabled = false;
          suggestBtn.textContent = "🔍";
        }
      };

      const verifyBtn = parent.createEl("button", { text: "✓", attr: { title: t.relSuggestVerify, style: iconBtnStyle } });
      verifyBtn.onclick = async () => {
        const resolved = resolveEdgesForSave(defs, [edge], { 0: this.edgeRelTypes[edgeIdx] || this.relType }, this.relType)[0];
        verifyBtn.disabled = true;
        verifyBtn.textContent = "⏳";
        try {
          const result = await requestEdgeVerification(this.app, this.host.settings, resolved.label, resolved.src, resolved.tgt);
          if (!result) {
            new Notice(t.relSuggestNoResult);
            return;
          }
          const icon = result.valid ? "✅" : "⚠️";
          const cx = result.counterexample ? ` — ${result.counterexample}` : "";
          new Notice(`${icon} ${resolved.label}: ${result.reason}${cx}`);
        } catch (err) {
          new Notice(`❌ ${t.relSuggestError}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          verifyBtn.disabled = false;
          verifyBtn.textContent = "✓";
        }
      };

      return select;
    };

    const updateFlowPreview = () => {
      flowBody.empty();
      const edges = generate();

      if (count > 2) {
        const masterRow = flowBody.createEl("div", {
          attr: { style: "display: flex; align-items: center; gap: 12px; padding: 8px 14px; margin-bottom: 6px; background: var(--background-primary); border-radius: 6px; border: 1px dashed rgba(56, 189, 248, 0.25);" },
        });
        masterRow.createEl("span", { text: t.relBulkChange, attr: { style: "font-size: 0.78em; font-weight: 600; color: var(--text-muted); flex-shrink: 0;" } });
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

      const listEl = flowBody.createEl("div", { attr: { style: "display: flex; flex-direction: column; gap: 4px;" } });
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

    focalWrap.createEl("span", { text: t.relFocalNote, attr: { style: "font-size: 0.85em; font-weight: 600; color: var(--text-normal); white-space: nowrap;" } });
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
    if (this.topology === "CHAIN") focalWrap.style.display = "none";

    descArea.oninput = () => {
      this.relDesc = descArea.value;
      updateCypherPreview();
    };

    updateFlowPreview();
    updateCypherPreview();

    this.renderFooter(contentEl, t, defs, generate);
  }

  private renderHeader(contentEl: HTMLElement, t: ReturnType<typeof getTranslation>, count: number): void {
    const headerRow = contentEl.createEl("div", {
      attr: { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.08)); padding-bottom: 14px;" },
    });
    const headerLeft = headerRow.createEl("div", { attr: { style: "display: flex; align-items: center; gap: 10px;" } });
    headerLeft.createEl("div", { attr: { style: "width: 8px; height: 8px; border-radius: 50%; background: var(--interactive-accent, #38bdf8);" } });
    headerLeft.createEl("h3", {
      text: this.initialEdge ? t.relModalEditTitle : t.relModalTitle,
      attr: { style: "margin: 0; font-size: 1.1em; font-weight: 700; color: var(--text-normal);" },
    });
    headerRow.createEl("span", {
      text: `${count} ${t.relNotesSelected}`,
      attr: { style: "font-family: var(--font-monospace); font-size: 0.8em; padding: 4px 12px; background: var(--background-primary-alt, rgba(255, 255, 255, 0.05)); color: var(--text-muted); border-radius: 12px; border: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.1));" },
    });
  }

  private renderEdgeRow(
    listEl: HTMLElement,
    e: RelationEdgeDraft,
    idx: number,
    createSingleDropdown: (parent: HTMLElement, edgeIdx: number, edge: RelationEdgeDraft) => HTMLSelectElement
  ): void {
    const cleanSrc = e.src.title.replace(/[\r\n]+/g, " ").trim();
    const cleanTgt = e.tgt.title.replace(/[\r\n]+/g, " ").trim();

    const row = listEl.createEl("div");
    Object.assign(row.style, {
      display: "flex",
      flexDirection: "row",
      flexWrap: "nowrap",
      alignItems: "center",
      padding: "10px 14px",
      borderRadius: "6px",
      background: "var(--background-primary)",
      borderLeft: `3px solid ${idx % 2 === 0 ? "rgba(56, 189, 248, 0.5)" : "rgba(16, 185, 129, 0.5)"}`,
      transition: "background 0.15s ease",
      marginBottom: "4px",
    });
    row.addEventListener("mouseenter", () => {
      row.style.background = "var(--background-primary-alt, rgba(255,255,255,0.04))";
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "var(--background-primary)";
    });

    const srcDiv = row.createEl("div");
    Object.assign(srcDiv.style, {
      flex: "1 1 0px",
      minWidth: "0",
      fontSize: "0.88em",
      fontWeight: "600",
      color: "var(--text-normal)",
      textAlign: "right",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      paddingRight: "10px",
    });
    srcDiv.title = cleanSrc;
    srcDiv.textContent = cleanSrc;

    const center = row.createEl("div");
    Object.assign(center.style, { display: "flex", flexDirection: "row", flexWrap: "nowrap", alignItems: "center", gap: "6px", flexShrink: "0" });
    const arrowL = center.createEl("span");
    arrowL.textContent = "→";
    arrowL.style.fontSize = "1em";
    arrowL.style.color = "var(--text-faint)";
    createSingleDropdown(center, idx, e);
    const arrowR = center.createEl("span");
    arrowR.textContent = "→";
    arrowR.style.fontSize = "1em";
    arrowR.style.color = "var(--text-faint)";

    const tgtDiv = row.createEl("div");
    Object.assign(tgtDiv.style, {
      flex: "1 1 0px",
      minWidth: "0",
      fontSize: "0.88em",
      fontWeight: "600",
      color: "var(--text-normal)",
      textAlign: "left",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      paddingLeft: "10px",
    });
    tgtDiv.title = cleanTgt;
    tgtDiv.textContent = cleanTgt;
  }

  private renderFooter(contentEl: HTMLElement, t: ReturnType<typeof getTranslation>, defs: RelationTermDef[], generate: () => RelationEdgeDraft[]): void {
    const btnRow = contentEl.createEl("div", { attr: { style: "display: flex; gap: 12px; justify-content: flex-end; align-items: center;" } });
    this.renderDeleteButton(btnRow, t);
    const cancelBtn = btnRow.createEl("button", { text: t.relCancelBtn });
    cancelBtn.style.padding = "8px 16px";
    cancelBtn.onclick = () => this.close();

    const saveBtn = btnRow.createEl("button", {
      text: t.relSaveBtn,
      attr: { style: "background: var(--interactive-accent, #38bdf8); color: #ffffff; font-weight: 600; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer;" },
    });

    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.setText(t.relSaving);

      const resolvedEdges = resolveEdgesForSave(defs, generate(), this.edgeRelTypes, this.relType);
      let createdCount = 0;
      const typedEdges: { src: RelationNode; tgt: RelationNode; relType: string; description: string; bidirectional: boolean; originalTerm: string }[] = [];
      for (const e of resolvedEdges) {
        const path = relationFilePath(e);
        const content = buildRelationFileContent(e, this.relDesc, t, this.host.settings.graphBackend);
        try {
          await writeRelationFile(this.app, path, content);
          createdCount++;
          typedEdges.push({ src: e.src, tgt: e.tgt, relType: e.label, description: this.relDesc, bidirectional: e.bidirectional, originalTerm: e.originalTerm });
        } catch (err) {
          console.error(`${t.relSaveError} ${path}:`, err);
        }
      }

      new Notice(`${createdCount} ${t.relSaveSuccess}`);

      if (this.host.settings.autoSyncGraph && typedEdges.length > 0) {
        try {
          await getGraphStore(this.app, this.host.settings).upsertTypedEdges(typedEdges);
          new Notice(`✅ ${typedEdges.length} Beziehung(en) direkt synchronisiert.`);
        } catch (err) {
          // Retrying later only makes sense for a temporarily-unreachable network backend - a local SQLite write failing won't self-resolve that way.
          if (this.host.settings.graphBackend === "memgraph") {
            enqueuePendingRelations(this.host.settings, typedEdges);
            await this.host.saveSettings();
            new Notice(
              `⚠️ Memgraph gerade nicht erreichbar: ${err instanceof Error ? err.message : String(err)} — wird automatisch nachgeholt, sobald die Verbindung wieder da ist.`
            );
          } else {
            new Notice(`❌ Lokale Graph-Datenbank Fehler: ${err instanceof Error ? err.message : String(err)}`);
          }
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
      attr: { style: "background: transparent; color: var(--text-error, #f87171); font-weight: 600; border: 1px solid var(--text-error, #f87171); padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-right: auto;" },
    });

    deleteBtn.onclick = async () => {
      if (!window.confirm(t.relDeleteConfirm)) return;
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

      const [srcNode, tgtNode] = this.selectedNodes;
      if (this.host.settings.autoSyncGraph) {
        try {
          await getGraphStore(this.app, this.host.settings).deleteEdge(srcNode.id, tgtNode.id, initialEdge.relType);
          new Notice(`🗑️ ${t.relDeleteSuccess}`);
        } catch (err) {
          new Notice(`⚠️ ${t.relDeleteSyncWarning}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        new Notice(`🗑️ ${t.relDeleteSuccess}`);
      }

      this.onSaved?.();
      this.close();
    };
  }
}
