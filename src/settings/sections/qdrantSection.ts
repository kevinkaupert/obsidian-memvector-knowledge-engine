import { Notice, Setting, type App } from "obsidian";
import { syncVaultToQdrant } from "../../sync/qdrant/qdrantSync";
import type { TranslationKeys } from "../../i18n";
import type { SettingsHost } from "../types";

export function renderQdrantSection(containerEl: HTMLElement, app: App, host: SettingsHost, t: TranslationKeys): void {
  const { settings } = host;
  containerEl.createEl("h3", { text: t.secQdrant });

  new Setting(containerEl)
    .setName(t.qdrantUrlName)
    .setDesc(t.qdrantUrlDesc)
    .addText((text) =>
      text
        .setPlaceholder("http://localhost:6333")
        .setValue(settings.qdrantUrl || "http://localhost:6333")
        .onChange(async (value) => {
          settings.qdrantUrl = value.trim();
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.qdrantCollName)
    .setDesc(t.qdrantCollDesc)
    .addText((text) =>
      text
        .setPlaceholder("obsidian_wiki_vectors")
        .setValue(settings.qdrantCollection || "obsidian_wiki_vectors")
        .onChange(async (value) => {
          settings.qdrantCollection = value.trim();
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.qdrantKeyName)
    .setDesc(t.qdrantKeyDesc)
    .addText((text) =>
      text
        .setPlaceholder("Optional Key...")
        .setValue(settings.qdrantApiKey || "")
        .onChange(async (value) => {
          settings.qdrantApiKey = value.trim();
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.qdrantAutoSyncName)
    .setDesc(t.qdrantAutoSyncDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.autoSyncQdrant || false).onChange(async (value) => {
        settings.autoSyncQdrant = value;
        await host.saveSettings();
      })
    );

  new Setting(containerEl)
    .setName("Gesamtes Vault in Qdrant indizieren")
    .setDesc("Berechnet Embeddings für alle Notizen im Vault und lädt sie direkt in die Qdrant Vektor-Datenbank.")
    .addButton((btn) =>
      btn
        .setButtonText("Jetzt Vault in Qdrant synchronisieren")
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Synchronisiere Vault...");
          btn.setDisabled(true);
          try {
            new Notice(`🚀 Starte Qdrant-Synchronisation für ${app.vault.getMarkdownFiles().length} Notizen...`);
            const result = await syncVaultToQdrant(app, settings);
            if (result.syncedCount > 0) {
              btn.setButtonText("✅ Synchronisiert!");
              new Notice(`✅ Qdrant erfolgreich mit ${result.syncedCount} Notizen befüllt!`);
            } else {
              new Notice("⚠️ Keine Embeddings generiert (Ollama prüfen).");
            }
          } catch (err) {
            btn.setButtonText("❌ Fehlgeschlagen");
            new Notice(`❌ Qdrant Sync-Fehler: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setTimeout(() => {
              btn.setButtonText("Jetzt Vault in Qdrant synchronisieren");
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );
}
