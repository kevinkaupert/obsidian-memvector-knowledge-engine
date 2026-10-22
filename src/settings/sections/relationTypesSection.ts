import { Menu, Modal, Notice, Setting, type App } from "obsidian";
import { labelOnSlot, placeOnSlot, setDeprecated, slotOfLabel } from "../../relationVocabulary/canvasSlotEdits";
import { CANVAS_SLOTS, canvasSlot, canvasSlotTitle } from "../../relationVocabulary/canvasSlots";
import type { CanvasSlot, CanvasSlotId } from "../../relationVocabulary/types";
import { withFolder, type TranslationKeys } from "../../i18n";
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
import { applyLayoutEdit, type LayoutPatch } from "../../relationVocabulary/layoutDefaults";
import { createVocabularyMutator, type VocabularyMutation, type VocabularyTransform } from "../../relationVocabulary/vocabularyMutations";
import { sanitizeRelType } from "../../relationVocabulary/resolveTerm";
import type { RelationTermDef } from "../../relationVocabulary/types";
import type { SettingsHost } from "../types";
import { presetsFolder } from "../../vaultLayout";
import { MAX_RELATION_WEIGHT_FACTOR } from "../../views/vectorScatter/layout/layoutTunables";

/**
 * Purpose: Resolves the vault path of the active vocabulary file from settings.
 * Architecture: Read on each call rather than captured when the section renders - the active
 * vocabulary can change while the Settings tab is on screen (preset switch, delete, or a direct
 * path edit), and a write built against a stale path lands in the file the user just left.
 */
function activeVocabularyPath(host: SettingsHost): string {
  return (host.settings.relationVocabularyPath || DEFAULT_RELATION_VOCABULARY_PATH).trim() || DEFAULT_RELATION_VOCABULARY_PATH;
}

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
    const presets = await listPresets(app, presetsFolder(host.settings));
    const activePath = activeVocabularyPath(host);
    const activeKey = activePresetKey(activePath, presets);
    const selected = presets.find((p) => p.key === activeKey);
    const terms = await loadRelationVocabulary(app, host.settings);

    // 1. Active preset selector
    new Setting(sectionEl)
      .setName(t.relPresetName)
      .setDesc(withFolder(t.relPresetDesc, presetsFolder(host.settings)))
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
      .setDesc(withFolder(t.relVocabPathDesc, presetsFolder(host.settings)));
    vocabSetting.settingEl.addClass("memvector-setting-block");
    vocabSetting.controlEl.addClass("memvector-setting-full-width");
    vocabSetting.addText((text) => {
      text.inputEl.addClass("memvector-textarea-mono");
      text.setPlaceholder(DEFAULT_RELATION_VOCABULARY_PATH).setValue(activePath);

      /**
       * Commits the typed path once the user is done with the field. Persisting on every
       * keystroke would store half-typed paths, and the vocabulary loader creates whatever
       * path it is handed - so an intermediate value can leave a stray file, and a folder,
       * behind in the vault. Committing also refreshes the open view and rebuilds the type
       * table, which would otherwise keep editing the previously active file.
       */
      const commitPath = async (): Promise<void> => {
        const next = text.getValue().trim() || DEFAULT_RELATION_VOCABULARY_PATH;
        if (next === activeVocabularyPath(host)) return;
        host.settings.relationVocabularyPath = next;
        await host.saveSettings();
        host.applySettingsToOpenViews?.({ relayout: true });
        rerender();
      };

      text.inputEl.addEventListener("blur", () => void commitPath());
      text.inputEl.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        void commitPath();
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
        host.applySettingsToOpenViews?.({ relayout: true });
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
        host.applySettingsToOpenViews?.({ relayout: true });
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
        host.applySettingsToOpenViews?.({ relayout: true });
        new Notice(`[OK] ${t.relPresetDeleted}`);
        rerender();
      } catch (err) {
        new Notice(`[ERROR] ${t.relPresetError} ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    // 4. Canvas handles: which type is on which Canvas Tutor handle (knowOS ADR-0011), thought from the canvas
    const handlesDetails = sectionEl.createEl("details", { cls: "memvector-types-details" });
    handlesDetails.createEl("summary", { text: t.relCanvasHandlesTitle });
    renderCanvasHandles(handlesDetails.createDiv({ cls: "memvector-types-details-body" }), terms, () => activeVocabularyPath(host), app, host, t, rerender);

    // 5. Types of the active preset - collapsible so the settings tab stays tidy
    const typesDetails = sectionEl.createEl("details", { cls: "memvector-types-details" });
    typesDetails.createEl("summary", { text: t.relTypesInPreset });
    const typesEl = typesDetails.createDiv({ cls: "memvector-types-details-body" });
    renderTypeTable(typesEl, terms, () => activeVocabularyPath(host), app, host, t, rerender);

    const resetBtn = typesEl.createDiv({ cls: "memvector-type-reset-row" }).createEl("button", { text: t.relTypeResetBtn });
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

/** Asks before a type moves from one canvas handle to another. */
class ConfirmModal extends Modal {
  private resolve: ((ok: boolean) => void) | null = null;

  constructor(app: App, private readonly message: string, private readonly okText: string, private readonly cancelText: string) {
    super(app);
  }

  ask(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: this.message });
    const row = this.contentEl.createDiv({ cls: "memvector-relation-footer" });
    row.createEl("button", { text: this.okText, cls: "mod-cta" }).onclick = () => this.finish(true);
    row.createEl("button", { text: this.cancelText }).onclick = () => this.finish(false);
  }

  private finish(ok: boolean): void {
    const resolve = this.resolve;
    this.resolve = null;
    this.close();
    resolve?.(ok);
  }

  onClose(): void {
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.(false);
  }
}

/**
 * Purpose: Renders the canvas handles as a compass: per handle the type on it and its subject (knowOS ADR-0011).
 * Architecture: Built from the slot list (canvasSlots.ts), so a new direction needs no UI change. Thought from the
 * canvas: choosing a type for a handle takes the handle from its previous type; a type already on another handle
 * moves only after the user confirms. Handles of a newer contract are listed as unknown and kept. Exported so tests
 * can drive the real handlers; `confirm` is injectable for them.
 */
export function renderCanvasHandles(
  parent: HTMLElement,
  terms: RelationTermDef[],
  resolvePath: () => string,
  app: App,
  host: SettingsHost,
  t: TranslationKeys,
  rerender: () => void,
  confirm: (message: string) => Promise<boolean> = (message) =>
    new ConfirmModal(app, message, t.relCanvasMoveOk, t.relPresetNameModalCancel).ask()
): void {
  const lang = host.settings.language || "de";
  parent.createEl("p", { text: t.relCanvasHandlesHint, cls: "setting-item-description" });
  const mutator = createVocabularyMutator(app, resolvePath);
  const write = async (transform: VocabularyTransform): Promise<void> => {
    const outcome = await mutator.mutate(transform);
    if (outcome.result === "written") host.applySettingsToOpenViews?.({ relayout: true });
    else if (outcome.result !== "skipped") new Notice(`[ERROR] ${t.relTypeWriteError} (${resolvePath()})`);
    rerender();
  };
  const labels = Array.from(new Set(terms.filter((x) => !x.deprecated).map((x) => x.label)));
  const grid = parent.createDiv({ cls: "memvector-canvas-handles" });
  const rows = Math.max(...CANVAS_SLOTS.map((s) => s.row)) + 1;
  const cols = Math.max(...CANVAS_SLOTS.map((s) => s.col)) + 1;
  grid.setAttribute("style", `grid-template-columns: repeat(${cols}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, auto);`);

  for (const def of CANVAS_SLOTS) {
    const cell = grid.createDiv({ cls: "memvector-canvas-handle" });
    cell.setAttribute("style", `grid-row: ${def.row + 1}; grid-column: ${def.col + 1};`);
    cell.createDiv({ text: canvasSlotTitle(def.id, lang), cls: "memvector-canvas-handle-title" });
    const holder = labelOnSlot(terms, def.id);
    const current = terms.find((x) => x.canvas?.slot === def.id)?.canvas;

    const typeSelect = cell.createEl("select", { cls: "memvector-canvas-handle-type" });
    typeSelect.createEl("option", { value: "", text: "—" });
    for (const label of labels) typeSelect.createEl("option", { value: label, text: label });
    typeSelect.value = holder ?? "";

    const subjectRow = cell.createDiv({ cls: "memvector-canvas-handle-subject" });
    subjectRow.createSpan({ text: `${t.relTypeColSubject}: ` });
    const subjectSelect = subjectRow.createEl("select");
    subjectSelect.createEl("option", { value: "source", text: t.relTypeSubjectSource });
    subjectSelect.createEl("option", { value: "new", text: t.relTypeSubjectNew });
    subjectSelect.value = current?.subject ?? "source";
    subjectSelect.disabled = !holder;

    const apply = async (): Promise<void> => {
      const label = typeSelect.value || null;
      const subject: CanvasSlot["subject"] = subjectSelect.value === "new" ? "new" : "source";
      const elsewhere = label ? slotOfLabel(terms, label) : null;
      if (label && elsewhere && elsewhere !== def.id) {
        const ok = await confirm(`${label} ${t.relCanvasMoveConfirm} ${canvasSlotTitle(elsewhere, lang)}. ${t.relCanvasMoveQuestion}`);
        if (!ok) {
          rerender();
          return;
        }
      }
      await write((now) => placeOnSlot(now, def.id, label, subject));
    };
    typeSelect.onchange = () => void apply();
    subjectSelect.onchange = () => void apply();
  }

  const unknown = terms.filter((x) => x.canvas && !canvasSlot(x.canvas.slot));
  if (unknown.length > 0) {
    parent.createEl("p", { text: t.relCanvasUnknown, cls: "setting-item-description" });
    const list = parent.createEl("ul");
    for (const x of unknown) list.createEl("li", { text: `${x.canvas!.slot}: ${x.label}` });
  }
}

/**
 * Purpose: Renders the per-label type table and its add form, wiring each control to a
 * field-level vocabulary mutation.
 * Architecture: Exported so tests can drive the real handlers. The defects this guards against
 * (a write built from the rendered snapshot, and one control overwriting the other's field) live
 * in the handlers, not in the helpers they call, so helper-level tests cannot see them.
 */
export function renderTypeTable(parent: HTMLElement, terms: RelationTermDef[], resolvePath: () => string, app: App, host: SettingsHost, t: TranslationKeys, rerender: () => void): void {
  const table = parent.createEl("table", { cls: "memvector-relation-type-table" });
  const head = table.createEl("thead").createEl("tr");
  for (const col of [t.relTypeColLabel, t.relTypeColCategory, t.relTypeColWeight, t.relTypeColDirection, t.relTypeColRepels, ""]) {
    head.createEl("th", { text: col });
  }

  const lang = host.settings.language || "de";
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
  const mutator = createVocabularyMutator(app, resolvePath);

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
      new Notice(`[ERROR] ${t.relTypeWriteError} (${resolvePath()})`);
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
  const updateLayout = (label: string, patch: LayoutPatch): Promise<VocabularyMutation> =>
    applyMutation((current) =>
      current.map((term) =>
        term.label.toUpperCase() === label.toUpperCase() ? applyLayoutEdit(term, patch) : term
      )
    );

  for (const term of uniqueTerms) {
    const row = tbody.createEl("tr");
    const labelCell = row.createEl("td", { text: term.label });
    labelCell.addClass("memvector-relation-type-label");
    // The handle this type has in Canvas Tutor, as a short sign; set in the canvas handles section above
    const slot = slotOfLabel(terms, term.label);
    if (slot) {
      labelCell.createSpan({ text: ` ${canvasSlot(slot)?.short ?? "?"}`, cls: "memvector-type-slot-badge" }).title = canvasSlotTitle(slot, lang);
    }
    if (term.deprecated) labelCell.addClass("memvector-type-deprecated");
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
      warnIfWeightCapped(parsed, t);
      // Only the field the user touched - sending the checkbox state too would write back
      // whatever it showed when the table was rendered, reverting a change made meanwhile.
      void updateLayout(term.label, { weight: parsed });
    };

    row.createEl("td", { text: term.bidirectional ? "↔" : "→" });

    const repelsCell = row.createEl("td");
    const repelsField = repelsCell.createEl("input", { type: "checkbox" });
    repelsField.checked = Boolean(term.repels);
    repelsField.title = t.relTypeColRepels;
    repelsField.onchange = () => void updateLayout(term.label, { repels: repelsField.checked });

    // Less frequent actions in a row menu, so the table keeps its width (deprecate, delete)
    const menuBtn = row.createEl("td").createEl("button", { text: "⋯", cls: "memvector-type-row-menu" });
    menuBtn.title = t.relTypeRowMenu;
    menuBtn.setAttribute("aria-label", t.relTypeRowMenu);
    menuBtn.onclick = (ev: MouseEvent) => {
      const menu = new Menu();
      menu.addItem((item) =>
        item.setTitle(t.relTypeColDeprecated).setChecked(term.deprecated === true).onClick(() => {
          let freed: CanvasSlotId | null = null;
          void applyMutation(
            (current) => {
              const edit = setDeprecated(current, term.label, term.deprecated !== true);
              freed = edit.freedSlot;
              return edit.terms;
            },
            () => {
              if (freed) new Notice(`[INFO] ${t.relTypeDeprecatedSlotRemoved} ${canvasSlotTitle(freed, lang)}`, 8000);
              rerender();
            }
          );
        })
      );
      menu.addItem((item) => item.setTitle(t.relTypeRemoveTitle).setIcon("trash").onClick(() => void removeType(term.label)));
      menu.showAtMouseEvent(ev);
    };
  }

  // 4. Add-type form - the table's last row, each control under the column it fills, so it
  // reads as the next type to add and never wraps mid-form in a narrow settings pane.
  const addRow = table.createEl("tfoot").createEl("tr", { cls: "memvector-type-add-row" });
  const labelInput = addRow.createEl("td").createEl("input", { type: "text", placeholder: t.relTypeAddLabelPlaceholder });
  labelInput.title = t.relTypeAddLabelPlaceholder;
  const categoryInput = addRow.createEl("td").createEl("input", { type: "text", placeholder: t.relTypeAddCategoryPlaceholder });
  categoryInput.title = t.relTypeAddCategoryPlaceholder;
  categoryInput.value = "Custom";
  const weightInput = addRow.createEl("td").createEl("input", { type: "number", placeholder: "1.0" });
  weightInput.addClass("memvector-type-weight-input");
  weightInput.title = t.relTypeColWeight;
  weightInput.value = "1.0";
  const bidirectionalToggle = addRow.createEl("td").createEl("label", { text: "↔", cls: "memvector-type-toggle-label" }).createEl("input", { type: "checkbox" });
  bidirectionalToggle.title = t.relTypeAddBidirectional;
  bidirectionalToggle.setAttribute("aria-label", t.relTypeAddBidirectional);
  const repelsToggle = addRow.createEl("td").createEl("input", { type: "checkbox" });
  repelsToggle.title = t.relTypeAddRepels;
  repelsToggle.setAttribute("aria-label", t.relTypeAddRepels);

  const addBtn = addRow.createEl("td").createEl("button", { text: "+" });
  addBtn.title = t.relTypeAddBtn;
  addBtn.setAttribute("aria-label", t.relTypeAddBtn);
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
        // Same fallback-safe serialization as the in-place editor. Dropping the fields
        // whenever they look like the generic defaults would hand a bundled label back to
        // the inheritance fallback: adding CONFLICTS_WITH with repulsion off would reload
        // as repels: true, and EQUIVALENT_TO added at weight 1.0 as 1.3.
        return [...current, applyLayoutEdit(term, { weight: weightNum, repels: repelsToggle.checked })];
      },
      () => {
        new Notice(`[OK] ${t.relTypeAdded}`);
        if (Number.isFinite(weight)) warnIfWeightCapped(weight, t);
        rerender();
      }
    );
  };
}

/** Purpose: Formats the weight cap warning with the layout's actual cap. */
function weightCapMessage(t: TranslationKeys): string {
  return t.relTypeWeightCapped.split("{max}").join(String(MAX_RELATION_WEIGHT_FACTOR));
}

/**
 * Purpose: Tells the user that a weight above the layout's attraction cap is saved but has no stronger effect.
 * Architecture: The value is kept, not clamped - the vocabulary is the user's data and the cap is a layout detail.
 */
function warnIfWeightCapped(weight: number, t: TranslationKeys): void {
  if (weight > MAX_RELATION_WEIGHT_FACTOR) new Notice(`[INFO] ${weightCapMessage(t)}`, 8000);
}
