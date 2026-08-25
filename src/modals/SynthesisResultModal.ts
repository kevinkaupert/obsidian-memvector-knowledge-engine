import { Component, MarkdownRenderer, Modal, Notice, type App } from "obsidian";
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
    contentEl.style.maxHeight = "80vh";
    contentEl.style.overflowY = "auto";

    const lang = this.settings?.language || "de";
    const t = getTranslation(lang);

    contentEl.createEl("h2", { text: `${t.synthModalTitle} (${this.modelName})` });
    contentEl.createEl("p", {
      text: `${t.synthLinkedNotes} ${this.selectedNodes.map((n) => n.title).join(", ")}`,
      style: "color: var(--text-muted); font-size: 0.9em;",
    } as DomElementInfoCompat);

    const resultBox = contentEl.createEl("div", { cls: "markdown-rendered" });
    Object.assign(resultBox.style, {
      background: "var(--background-secondary)",
      padding: "16px",
      borderRadius: "8px",
      fontSize: "0.95em",
      margin: "12px 0",
      maxHeight: "500px",
      overflowY: "auto",
      lineHeight: "1.6",
    });

    // The bundled obsidian types declare Modal as `implements HistoryHandler`
    // only, not `extends Component`, even though the real runtime class does
    // extend Component (which is exactly why passing `this` here works).
    void MarkdownRenderer.render(this.app, this.synthesisText, resultBox, "", this as unknown as Component);

    const btnRow = contentEl.createEl("div");
    Object.assign(btnRow.style, { display: "flex", gap: "10px", justifyContent: "flex-end" });

    const saveBtn = btnRow.createEl("button", {
      text: t.synthSaveBtn,
      style: "background: var(--interactive-accent); color: var(--text-on-accent);",
    } as DomElementInfoCompat);

    const closeBtn = btnRow.createEl("button", { text: t.synthCloseBtn });
    closeBtn.onclick = () => this.close();

    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.setText(t.synthSaving);
      const slug = this.selectedNodes
        .map((n) => n.id)
        .join("-")
        .slice(0, 50)
        .toLowerCase();
      const fileName = `wiki/synthesis/synthese-${slug}.md`;
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
      await this.app.vault.create(fileName, frontmatter);
      new Notice(`${t.noticeSynthSaved} '${fileName}' ${t.noticeSynthSavedSuffix}`);
      this.close();
    };
  }
}
