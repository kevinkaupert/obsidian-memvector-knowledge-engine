import { ItemView, type TFile, type WorkspaceLeaf } from "obsidian";
import { MATH_WIKI_VIEW_TYPE } from "../../constants";
import type { MemVectorSettings } from "../../settings/types";
import { renderActiveNoteFocus } from "./renderActiveNoteFocus";

/**
 * The original class carried a cluster of never-invoked members
 * (apiServerUrl - always undefined at runtime since registerView only ever
 * passed `leaf`, no second constructor arg; selectionState/updateSelection/
 * setReplaceCallback/onReplaceCallback - nothing in the whole bundle ever
 * calls updateSelection or setReplaceCallback). Dropped as dead code rather
 * than ported; getViewType/getDisplayText/getIcon/onOpen/renderView are the
 * only members anything actually calls.
 */
export class MathWikiSidebarView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly getSettings: () => MemVectorSettings
  ) {
    super(leaf);
  }

  getViewType(): string {
    return MATH_WIKI_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "MemVector Co-Pilot";
  }

  getIcon(): string {
    return "function-square";
  }

  async onOpen(): Promise<void> {
    await this.renderView();
  }

  async renderView(focusFile?: TFile): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement | undefined;
    if (!container) return;
    container.empty();

    const header = container.createEl("h3", { text: "MemVector Co-Pilot" });
    header.style.marginBottom = "15px";

    await renderActiveNoteFocus(this.app, container, this.getSettings(), focusFile);
  }
}
