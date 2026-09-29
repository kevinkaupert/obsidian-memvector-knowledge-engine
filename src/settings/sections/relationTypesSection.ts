import { Modal, Notice, Setting, type App } from "obsidian";
import type { TranslationKeys } from "../../i18n";
import { DEFAULT_RELATION_VOCABULARY } from "../../relationVocabulary/defaultVocabulary";
import { DEFAULT_RELATION_VOCABULARY_PATH } from "../../relationVocabulary/loadRelationVocabulary";
import { loadRelationVocabulary } from "../../relationVocabulary/loadRelationVocabulary";
import {
  activatePreset,
  createPreset,
  deletePreset,
  listPresets,
  renamePreset,
  writeVocabularyFile,
  type RelationPreset,
} from "../../relationVocabulary/presets";
import { applyLayoutEdit } from "../../relationVocabulary/layoutDefaults";
import { createVocabularyMutator, type VocabularyMutation, type VocabularyTransform } from "../../relationVocabulary/vocabularyMutations";
import { sanitizeRelType } from "../../relationVocabulary/resolveTerm";
import type { RelationTermDef } from "../../relationVocabulary/types";
import type { SettingsHost } from "../types";

function activePresetKey(settingsPath: string, presets: RelationPreset[]): string | null {
  const path = (settingsPath || "").trim();
  return presets.find((p) => p.path === path)?.key ?? null;
}

class PresetNameModal extends Modal {
  private resolve: ((name: string | null) => void) | null = null;

  constructor(app: App, private readonly t: TranslationKeys, private readonly initial = "") {
    super(app);
  }

  openPrompt(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.t.relPresetNameModalTitle });

    const input = contentEl.createEl("input", { type: "text" });
    input.value = this.initial;
    input.addClass("memvector-preset-name-input");
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") this.submit(input.value);
    });

    const btnRow = contentEl.createDiv({ cls: "memvector-relation-footer" });
    const okBtn = btnRow.createEl("button", { text: this.t.relPresetNameModalOk, cls: "mod-cta" });
    okBtn.onclick = () => this.submit(input.value);
    const cancelBtn = btnRow.createEl("button", { text: this.t.relPresetNameModalCancel });
    cancelBtn.onclick = () => this.closeWith(null);
  }

  private submit(value: string): void {
    const name = value.trim();
    this.closeWith(name || null);
  }

  private closeWith(value: string | null): void {
    const resolve = this.resolve;
    this.resolve = null;
    this.close();
    resolve?.(value);
  }

  onClose(): void {
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.(null);
  }
}

/**
 * Purpose: Settings section managing the active relation-type preset and its terms (Issue #119).
 * Architecture: Presets are vault-owned JSON files (wiki/presets/); the active preset is just
 * settings.relationVocabularyPath pointing at one of them. All mutations rewrite the file and
 * re-render - the Relation Builder and 2D layout pick the vocabulary up on next use.
 */
export function renderRelationTypesSection(containerEl: HTMLElement, app: App, host: SettingsHost, t: TranslationKeys, rerender: () => void): void {
  containerEl.createEl("h3", { text: t.secRelationTypes });
  const sectionEl = containerEl.createDiv({ cls: "memvector-relation-types-section" });

  void (async () => {
    const presets = await listPresets(app);
    const activePath = (host.settings.relationVocabularyPath || DEFAULT_RELATION_VOCABULARY_PATH).trim() || DEFAULT_RELATION_VOCABULARY_PATH;
    const activeKey = activePresetKey(activePath, presets);
    const selected = presets.find((p) => p.key === activeKey);
    const terms = await loadRelationVocabulary(app, host.settings);

    // 1. Active preset selector
    new Setting(sectionEl)
      .setName(t.relPresetName)
      .setDesc(t.relPresetDesc)
      .addDropdown((dropdown) => {
        for (const p of presets) dropdown.addOption(p.key, p.label);
        if (!activeKey) {
          dropdown.addOption("__custom__", t.relPresetCustomOption);
          dropdown.setValue("__custom__");
        } else {
          dropdown.setValue(activeKey);
        }
        dropdown.onChange(async (value) => {
          if (value === "__custom__") return;
          try {
            await activatePreset(app, host, value);
            host.applySettingsToOpenViews?.({ relayout: true });
            new Notice(`[OK] ${t.relPresetActivated}`);
            rerender();
          } catch (err) {
            new Notice(`[ERROR] ${t.relPresetError} ${err instanceof Error ? err.message : String(err)}`);
          }
        });
      });

    // 2. Active vocabulary file path (advanced - normally managed via presets above)
    const vocabSetting = new Setting(sectionEl)
      .setName(t.relVocabPathName)
      .setDesc(t.relVocabPathDesc);
    vocabSetting.settingEl.addClass("memvector-setting-block");
    vocabSetting.controlEl.addClass("memvector-setting-full-width");
    vocabSetting.addText((text) => {
      text.inputEl.addClass("memvector-textarea-mono");
      text
        .setPlaceholder("wiki/relation-types.json")
        .setValue(activePath)
        .onChange(async (value) => {
          host.settings.relationVocabularyPath = value;
          await host.saveSettings();
        });
    });

    // 3. Preset management buttons
    const manageRow = sectionEl.createDiv({ cls: "memvector-preset-manage-row" });

    const newBtn = manageRow.createEl("button", { text: t.relPresetNewBtn });
    newBtn.onclick = async () => {
      const name = await new PresetNameModal(app, t).openPrompt();
      if (!name) return;
      try {
        await createPreset(app, host, name);
        new Notice(`[OK] ${t.relPresetCreated}`);
        rerender();
      } catch (err) {
        new Notice(`[ERROR] ${t.relPresetError} ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    const renameBtn = manageRow.createEl("button", { text: t.relPresetRenameBtn });
    renameBtn.disabled = !selected || selected.bundled;
    renameBtn.onclick = async () => {
      if (!selected || selected.bundled) return;
      const name = await new PresetNameModal(app, t, selected.label).openPrompt();
      if (!name) return;
      try {
        await renamePreset(app, host, selected.key, name);
        new Notice(`[OK] ${t.relPresetRenamed}`);
        rerender();
      } catch (err) {
        new Notice(`[ERROR] ${t.relPresetError} ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    const deleteBtn = manageRow.createEl("button", { text: t.relPresetDeleteBtn });
    deleteBtn.disabled = !selected || selected.bundled;
    deleteBtn.onclick = async () => {
      if (!selected || selected.bundled) return;
      try {
        await deletePreset(app, host, selected.key);
        new Notice(`[OK] ${t.relPresetDeleted}`);
        rerender();
      } catch (err) {
        new Notice(`[ERROR] ${t.relPresetError} ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    // 4. Types of the active preset - collapsible so the settings tab stays tidy
    const typesDetails = sectionEl.createEl("details", { cls: "memvector-types-details" });
    typesDetails.createEl("summary", { text: t.relTypesInPreset });
    const typesEl = typesDetails.createDiv({ cls: "memvector-types-details-body" });
    renderTypeTable(typesEl, terms, activePath, app, host, t, rerender);

    const resetBtn = typesEl.createEl("button", { text: t.relTypeResetBtn });
    resetBtn.onclick = async () => {
      try {
        await writeVocabularyFile(app, activePath, DEFAULT_RELATION_VOCABULARY);
        host.applySettingsToOpenViews?.({ relayout: true });
        new Notice(`[OK] ${t.relTypeResetDone}`);
        rerender();
      } catch (err) {
        new Notice(`[ERROR] ${t.relTypeWriteError} (${err instanceof Error ? err.message : String(err)})`);
      }
    };
  })().catch((err) => {
    console.error("MemVector: failed to render relation types section:", err);
  });
}

function renderTypeTable(parent: HTMLElement, terms: RelationTermDef[], activePath: string, app: App, host: SettingsHost, t: TranslationKeys, rerender: () => void): void {
  const table = parent.createEl("table", { cls: "memvector-relation-type-table" });
  const head = table.createEl("thead").createEl("tr");
  for (const col of [t.relTypeColLabel, t.relTypeColCategory, t.relTypeColWeight, t.relTypeColDirection, t.relTypeColRepels, ""]) {
    head.createEl("th", { text: col });
  }

  const tbody = table.createEl("tbody");
  // A vocabulary may hold several synonym entries per canonical label, but weight/repels
  // apply per label - group by label so each appears exactly once in the table.
  const byLabel = new Map<string, RelationTermDef>();
  for (const term of terms) {
    const labelKey = term.label.toUpperCase();
    if (!byLabel.has(labelKey)) byLabel.set(labelKey, term);
  }
  const uniqueTerms = Array.from(byLabel.values());

  // Every write re-reads the file first: rebuilding it from `terms` (captured when the
  // table was rendered) would revert every edit made since, so a second weight edit,
  // a delete or an add would silently drop the previous one.
  const mutator = createVocabularyMutator(app, activePath);

  /**
   * Applies one vocabulary mutation and reports its outcome to the user. A read failure is
   * surfaced rather than swallowed - it means the file is gone or unparseable, and writing
   * anything at that point would truncate the vocabulary.
   */
  const applyMutation = async (transform: VocabularyTransform, onWritten?: () => void): Promise<VocabularyMutation> => {
    const outcome = await mutator.mutate(transform);
    if (outcome.result === "written") {
      host.applySettingsToOpenViews?.({ relayout: true });
      onWritten?.();
    } else if (outcome.result === "read-failed") {
      new Notice(`[ERROR] ${t.relTypeWriteError} (${activePath})`);
      rerender();
    } else if (outcome.result === "write-failed") {
      const err = outcome.error;
      new Notice(`[ERROR] ${t.relTypeWriteError} (${err instanceof Error ? err.message : String(err)})`);
      rerender();
    }
    return outcome;
  };

  const removeType = (label: string): Promise<VocabularyMutation> =>
    applyMutation(
      (current) => current.filter((term) => term.label.toUpperCase() !== label.toUpperCase()),
      () => {
        new Notice(`[OK] ${t.relTypeRemoved}`);
        rerender();
      }
    );

  /**
   * Writes one label's layout semantics back to the vocabulary file, applied to every
   * synonym entry of that label so the grouped table row stays the single truth.
   * Layout semantics have to be editable in place: deleting and re-adding a type to
   * change its weight would lose its category, wording and reversed flag.
   */
  const updateLayout = (label: string, weight: number, repels: boolean): Promise<VocabularyMutation> =>
    applyMutation((current) =>
      current.map((term) =>
        term.label.toUpperCase() === label.toUpperCase() ? applyLayoutEdit(term, weight, repels) : term
      )
    );

  for (const term of uniqueTerms) {
    const row = tbody.createEl("tr");
    row.createEl("td", { text: term.label }).addClass("memvector-relation-type-label");
    row.createEl("td", { text: term.category });

    const weightCell = row.createEl("td");
    const weightField = weightCell.createEl("input", { type: "number" });
    weightField.addClass("memvector-type-weight-input");
    weightField.step = "0.05";
    weightField.min = "0";
    weightField.value = String(term.weight ?? 1.0);
    weightField.title = t.relTypeColWeight;
    weightField.onchange = () => {
      const parsed = Number.parseFloat(weightField.value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        new Notice(`[WARN] ${t.relTypeWeightInvalid}`);
        weightField.value = String(term.weight ?? 1.0);
        return;
      }
      void updateLayout(term.label, parsed, repelsField.checked);
    };

    row.createEl("td", { text: term.bidirectional ? "↔" : "→" });

    const repelsCell = row.createEl("td");
    const repelsField = repelsCell.createEl("input", { type: "checkbox" });
    repelsField.checked = Boolean(term.repels);
    repelsField.title = t.relTypeColRepels;
    repelsField.onchange = () => void updateLayout(term.label, Number.parseFloat(weightField.value), repelsField.checked);

    const delCell = row.createEl("td");
    const delBtn = delCell.createEl("button", { text: "✕" });
    delBtn.title = t.relTypeRemoveTitle;
    delBtn.setAttribute("aria-label", t.relTypeRemoveTitle);
    delBtn.onclick = () => void removeType(term.label);
  }

  // 4. Add-type form
  const addForm = parent.createDiv({ cls: "memvector-type-add-row" });
  const labelInput = addForm.createEl("input", { type: "text", placeholder: t.relTypeAddLabelPlaceholder });
  const categoryInput = addForm.createEl("input", { type: "text", placeholder: t.relTypeAddCategoryPlaceholder });
  categoryInput.value = "Custom";
  const weightInput = addForm.createEl("input", { type: "number", placeholder: "1.0" });
  weightInput.addClass("memvector-type-weight-input");
  weightInput.value = "1.0";
  const bidirectionalToggle = addForm.createEl("input", { type: "checkbox" });
  const bidirectionalLabel = addForm.createEl("label", { text: t.relTypeAddBidirectional, cls: "memvector-type-toggle-label" });
  bidirectionalLabel.prepend(bidirectionalToggle);
  const repelsToggle = addForm.createEl("input", { type: "checkbox" });
  const repelsLabel = addForm.createEl("label", { text: t.relTypeAddRepels, cls: "memvector-type-toggle-label" });
  repelsLabel.prepend(repelsToggle);

  const addBtn = addForm.createEl("button", { text: t.relTypeAddBtn });
  addBtn.onclick = () => {
    const label = sanitizeRelType(labelInput.value);
    if (!label) return;
    const weight = Number.parseFloat(weightInput.value);
    if (weightInput.value.trim() !== "" && (!Number.isFinite(weight) || weight < 0)) {
      new Notice(`[WARN] ${t.relTypeWeightInvalid}`);
      return;
    }

    void applyMutation(
      (current) => {
        // Duplicate check against the file's current contents, not the rendered snapshot.
        if (current.some((existing) => existing.label.toUpperCase() === label.toUpperCase())) {
          new Notice(`[WARN] ${t.relTypeDuplicate} ${label}`);
          return null;
        }
        const term: RelationTermDef = {
          key: `custom${label}`,
          label,
          term: label,
          category: categoryInput.value.trim() || "Custom",
          bidirectional: bidirectionalToggle.checked,
          reversed: false,
        };
        const weightNum = Number.isFinite(weight) ? weight : 1.0;
        if (weightNum !== 1.0) term.weight = weightNum;
        if (repelsToggle.checked) term.repels = true;
        return [...current, term];
      },
      () => {
        new Notice(`[OK] ${t.relTypeAdded}`);
        rerender();
      }
    );
  };
}
