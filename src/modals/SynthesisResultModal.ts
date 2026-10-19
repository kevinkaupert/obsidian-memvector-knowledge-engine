import { Component, MarkdownRenderer, Modal, Notice, type App } from "obsidian";
import { ensureParentFolder } from "../ensureFolder";
import { getTranslation, withFolder } from "../i18n";
import { wikiLinkTarget } from "../noteSlug";
import type { MemVectorSettings } from "../settings/types";
import { synthesisFolder, uniqueNotePath } from "../vaultLayout";
import { renderRetrievalWarning } from "../retrievalStatus";
import { serializeFrontmatter } from "../frontmatterYaml";
import { synthesisBaseName, synthesisFrontmatter, type SynthesisNode } from "../synthesisNote";
import { chooseNoteWriter } from "../noteWriter/noteWriter";

export class SynthesisResultModal extends Modal {
  constructor(
    app: App,
    private readonly selectedNodes: SynthesisNode[],
    private readonly synthesisText: string,
    private readonly modelName: string,
    private readonly settings: MemVectorSettings | undefined,
    private readonly warnings: string[] = []
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
    for (const warning of this.warnings) renderRetrievalWarning(contentEl, warning);
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
      text: withFolder(t.synthSaveBtn, synthesisFolder(this.settings ?? {})),
      cls: "mod-cta",
    });

    const closeBtn = btnRow.createEl("button", { text: t.synthCloseBtn });
    closeBtn.onclick = () => this.close();

    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.setText(t.synthSaving);
      const finalPath = uniqueNotePath(synthesisFolder(this.settings ?? {}), synthesisBaseName(this.selectedNodes), (p) => Boolean(this.app.vault.getAbstractFileByPath(p)));

      const synthTitlePrefix = lang === "de" ? "Synthese:" : "Synthesis:";
      const synthTitle = `${synthTitlePrefix} ${this.selectedNodes.map((n) => n.title).join(" & ")}`;
      const frontmatter = serializeFrontmatter(
        synthesisFrontmatter(this.selectedNodes, synthTitle, t.synthDocDesc, this.settings?.llmProvider, this.modelName)
      );
      const noteContent = `${frontmatter}
# ${synthTitlePrefix} ${this.selectedNodes.map((n) => `[[${wikiLinkTarget(n.path)}|${n.title}]]`).join(" & ")}

${this.warnings.map((warning) => `> [!warning] ${warning}\n\n`).join("")}${this.synthesisText}
`;
      try {
        const writer = await chooseNoteWriter(this.app, this.settings);
        await ensureParentFolder(this.app, finalPath);
        await writer.create(finalPath, noteContent, "memvector.synthesis_save");
        new Notice(`${t.noticeSynthSaved} '${finalPath}' ${t.noticeSynthSavedSuffix}`);
        this.close();
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.setText(withFolder(t.synthSaveBtn, synthesisFolder(this.settings ?? {})));
        new Notice(`[ERROR] ${t.saveErrorPrefix} ${err instanceof Error ? err.message : String(err)}`);
      }
    };
  }
}
