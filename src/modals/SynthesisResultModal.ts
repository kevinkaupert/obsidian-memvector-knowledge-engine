import { Component, MarkdownRenderer, Modal, Notice, type App } from "obsidian";
import { ensureParentFolder } from "../ensureFolder";
import { getTranslation } from "../i18n";
import type { DomElementInfoCompat } from "../obsidianCompat";
import type { MemVectorSettings } from "../settings/types";

interface SynthesisNode {
  id: string;
  title: string;
  path: string;
}

export class SynthesisResultModal extends Modal {
  constructor(
    app: App,
    private readonly selectedNodes: SynthesisNode[],
    private readonly synthesisText: string,
    private readonly modelName: string,
    private readonly settings: MemVectorSettings | undefined
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memvector-synthesis-modal");

    const lang = this.settings?.language || "de";
    const t = getTranslation(lang);

    contentEl.createEl("h2", { text: `${t.synthModalTitle} (${this.modelName})` });
    contentEl.createEl("p", {
      text: `${t.synthLinkedNotes} ${this.selectedNodes.map((n) => n.title).join(", ")}`,
      cls: "memvector-muted-text",
    });

    const resultBox = contentEl.createDiv({ cls: "markdown-rendered memvector-synthesis-box" });

    // The bundled obsidian types declare Modal as `implements HistoryHandler`
    // only, not `extends Component`, even though the real runtime class does
    // extend Component (which is exactly why passing `this` here works).
    void MarkdownRenderer.render(this.app, this.synthesisText, resultBox, "", this as unknown as Component);

    const btnRow = contentEl.createDiv({ cls: "memvector-synthesis-actions" });

    const saveBtn = btnRow.createEl("button", {
      text: t.synthSaveBtn,
      cls: "mod-cta",
    });

    const closeBtn = btnRow.createEl("button", { text: t.synthCloseBtn });
    closeBtn.onclick = () => this.close();

    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.setText(t.synthSaving);
      const slug = this.selectedNodes
        .map((n) => n.id)
        .join("-")
        .slice(0, 50)
      let finalPath = `wiki/synthesis/synthese-${slug}.md`;
      let counter = 1;
      while (this.app.vault.getAbstractFileByPath(finalPath)) {
        finalPath = `wiki/synthesis/synthese-${slug}-${counter}.md`;
        counter++;
      }

      const synthTitlePrefix = lang === "de" ? "Synthese:" : "Synthesis:";
      const frontmatter = `---
type: synthesis
title: "${synthTitlePrefix} ${this.selectedNodes.map((n) => n.title).join(" & ")}"
description: "${t.synthDocDesc}"
status: draft
sources: [${this.selectedNodes.map((n) => `"${n.path}"`).join(", ")}]
generated:
  by: "${this.modelName}"
  at: "${new Date().toISOString()}"
---

# ${synthTitlePrefix} ${this.selectedNodes.map((n) => `[[${n.id}|${n.title}]]`).join(" & ")}

${this.synthesisText}
`;
      try {
        await ensureParentFolder(this.app, finalPath);
        await this.app.vault.create(finalPath, frontmatter);
        new Notice(`${t.noticeSynthSaved} '${finalPath}' ${t.noticeSynthSavedSuffix}`);
        this.close();
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.setText(t.synthSaveBtn);
        new Notice(`[ERROR] Fehler beim Speichern: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
  }
}
