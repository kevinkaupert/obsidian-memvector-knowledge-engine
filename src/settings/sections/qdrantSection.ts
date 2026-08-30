import { Notice, SecretComponent, Setting, type App } from "obsidian";
import { getVectorStore } from "../../sync/storeFactory";
import { syncVaultVectors } from "../../sync/vaultVectorSync";
import type { TranslationKeys } from "../../i18n";
import { getQdrantApiKey, setQdrantApiKey } from "../secrets";
import type { SettingsHost } from "../types";

export function renderQdrantSection(containerEl: HTMLElement, app: App, host: SettingsHost, t: TranslationKeys, rerender: () => void): void {
  const { settings } = host;
  containerEl.createEl("h3", { text: t.secQdrant });
  const isLocal = settings.vectorBackend === "sqlite";

  new Setting(containerEl)
    .setName(t.vectorBackendName)
    .setDesc(t.vectorBackendDesc)
    .addDropdown((dropdown) =>
      dropdown
        .addOption("qdrant", t.vectorBackendQdrant)
        .addOption("sqlite", t.vectorBackendSqlite)
        .setValue(settings.vectorBackend)
        .onChange(async (value) => {
          settings.vectorBackend = value as "qdrant" | "sqlite";
          await host.saveSettings();
          rerender();
        })
    );

  if (isLocal) {
    containerEl.createEl("p", { text: t.vectorBackendLocalInfo, cls: "setting-item-description" });
  } else {
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

    const qdrantKeySetting = new Setting(containerEl).setName(t.qdrantKeyName).setDesc(t.qdrantKeyDesc);
    new SecretComponent(app, qdrantKeySetting.controlEl).setValue(getQdrantApiKey(app)).onChange((value) => setQdrantApiKey(app, value.trim()));
  }

  new Setting(containerEl)
    .setName(t.qdrantAutoSyncName)
    .setDesc(t.qdrantAutoSyncDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.autoSyncQdrant || false).onChange(async (value) => {
        settings.autoSyncQdrant = value;
        await host.saveSettings();
      })
    );

  const syncButtonText = isLocal ? "Jetzt Vault lokal indizieren" : "Jetzt Vault in Qdrant synchronisieren";
  new Setting(containerEl)
    .setName("Gesamtes Vault indizieren")
    .setDesc("Berechnet Embeddings für alle Notizen im Vault und lädt sie in die gewählte Vektor-Datenbank.")
    .addButton((btn) =>
      btn
        .setButtonText(syncButtonText)
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Synchronisiere Vault...");
          btn.setDisabled(true);
          try {
            new Notice(`🚀 Starte Vektor-Synchronisation für ${app.vault.getMarkdownFiles().length} Notizen...`);
            const result = await syncVaultVectors(app, settings, getVectorStore(app, settings));
            if (result.syncedCount > 0) {
              btn.setButtonText("✅ Synchronisiert!");
              new Notice(`✅ ${result.syncedCount} Notizen erfolgreich indiziert!`);
            } else {
              new Notice("⚠️ Keine Embeddings generiert (Ollama prüfen).");
            }
          } catch (err) {
            btn.setButtonText("❌ Fehlgeschlagen");
            new Notice(`❌ Sync-Fehler: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setTimeout(() => {
              btn.setButtonText(syncButtonText);
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );

  const testButtonText = isLocal ? "Lokale Vektor-Datenbank testen" : "Qdrant Verbindung testen";
  new Setting(containerEl)
    .setName(testButtonText)
    .setDesc(isLocal ? "Prüft, ob die lokale SQLite-Datei geöffnet werden kann." : "Prüft die Erreichbarkeit der Qdrant Vektor-Datenbank.")
    .addButton((btn) =>
      btn
        .setButtonText(testButtonText)
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Testen...");
          btn.setDisabled(true);
          try {
            await getVectorStore(app, settings).testConnection();
            btn.setButtonText("✅ Erfolgreich!");
            new Notice(isLocal ? "✅ Lokale Vektor-Datenbank ist verfügbar!" : "✅ Qdrant ist erreichbar!");
          } catch (err) {
            btn.setButtonText("❌ Fehlgeschlagen");
            new Notice(`❌ Verbindung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setTimeout(() => {
              btn.setButtonText(testButtonText);
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );
}
