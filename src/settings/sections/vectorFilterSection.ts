import { Notice, SecretComponent, Setting, type App } from "obsidian";
import { fetchProviderModels } from "../../llm/fetchProviderModels";
import type { TranslationKeys } from "../../i18n";
import { getEmbeddingApiKey, setEmbeddingApiKey } from "../secrets";
import { getGraphStore, getVectorStore } from "../../sync/storeFactory";
import { syncVaultVectors } from "../../sync/vaultVectorSync";
import { syncVaultGraph } from "../../sync/vaultGraphSync";
import type { KnowledgeDomain, LlmProvider, SettingsHost } from "../types";

interface EmbeddingProviderDefaults {
  embeddingApiBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
}

const EMBEDDING_PROVIDER_DEFAULTS: Record<string, EmbeddingProviderDefaults> = {
  ollama: { embeddingApiBaseUrl: "http://localhost:11434/v1", embeddingApiKey: "ollama", embeddingModel: "bge-m3" },
  openai: { embeddingApiBaseUrl: "https://api.openai.com/v1", embeddingApiKey: "", embeddingModel: "text-embedding-3-small" },
  custom: { embeddingApiBaseUrl: "http://localhost:8000/v1", embeddingApiKey: "", embeddingModel: "custom-embed" },
};

export function renderVectorFilterSection(containerEl: HTMLElement, app: App, host: SettingsHost, t: TranslationKeys, rerender: () => void): void {
  const { settings } = host;
  containerEl.createEl("h3", { text: t.secVector });

  new Setting(containerEl)
    .setName(t.domainName)
    .setDesc(t.domainDesc)
    .addDropdown((dropdown) =>
      dropdown
        .addOption("general", t.domainGeneral)
        .addOption("math", t.domainMath)
        .setValue(settings.knowledgeDomain)
        .onChange(async (value) => {
          settings.knowledgeDomain = value as KnowledgeDomain;
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.embedProvName)
    .setDesc(t.embedProvDesc)
    .addDropdown((dropdown) =>
      dropdown
        .addOption("ollama", "Ollama (Lokal - http://localhost:11434/v1)")
        .addOption("openai", "OpenAI Embeddings (api.openai.com)")
        .addOption("custom", "Custom REST Endpoint")
        .setValue(settings.embeddingProvider)
        .onChange(async (value) => {
          const defaults = EMBEDDING_PROVIDER_DEFAULTS[value];
          settings.embeddingProvider = value as LlmProvider;
          if (defaults) {
            settings.embeddingApiBaseUrl = defaults.embeddingApiBaseUrl;
            setEmbeddingApiKey(app, defaults.embeddingApiKey);
            settings.embeddingModel = defaults.embeddingModel;
          }
          await host.saveSettings();
          rerender();
        })
    );

  new Setting(containerEl)
    .setName(t.embedApiBaseName)
    .setDesc(t.embedApiBaseDesc)
    .addText((text) => {
      text.inputEl.addClass("memvector-input-full");
      text
        .setPlaceholder("http://localhost:11434/v1")
        .setValue(settings.embeddingApiBaseUrl || "http://localhost:11434/v1")
        .onChange(async (value) => {
          settings.embeddingApiBaseUrl = value.trim();
          await host.saveSettings();
        });
    });

  const embedKeySetting = new Setting(containerEl).setName(t.embedApiKeyName).setDesc(t.embedApiKeyDesc);
  new SecretComponent(app, embedKeySetting.controlEl).setValue(getEmbeddingApiKey(app)).onChange((value) => setEmbeddingApiKey(app, value.trim()));

  new Setting(containerEl)
    .setName("Embedding-Verbindung testen & Modelle abfragen")
    .setDesc("Prüft die API-Verbindung und lädt automatisch alle verfügbaren Embedding-Modelle vom Provider.")
    .addButton((btn) =>
      btn
        .setButtonText("Verbindung testen & Modelle laden")
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Testen...");
          btn.setDisabled(true);
          try {
            const models = await fetchProviderModels(settings.embeddingApiBaseUrl, getEmbeddingApiKey(app));
            btn.setButtonText("[OK] Erfolgreich!");
            new Notice(`[OK] Embedding-Verbindung erfolgreich! ${models.length} Modelle gefunden.`);
            if (models.length > 0) {
              settings.fetchedEmbedModels = models;
              if (!models.includes(settings.embeddingModel)) {
                settings.embeddingModel = models[0];
              }
              await host.saveSettings();
              rerender();
            }
          } catch (err) {
            btn.setButtonText("[ERROR] Fehlgeschlagen");
            new Notice(`[ERROR] Embedding-Verbindung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            window.setTimeout(() => {
              btn.setButtonText("Verbindung testen & Modelle laden");
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );

  const fetchedEmbed = settings.fetchedEmbedModels || [];
  const embedModelSetting = new Setting(containerEl).setName(t.embedModelName).setDesc(t.embedModelDesc);

  if (fetchedEmbed.length > 0) {
    embedModelSetting.addDropdown((dropdown) => {
      for (const m of fetchedEmbed) {
        dropdown.addOption(m, m);
      }
      dropdown.setValue(settings.embeddingModel || fetchedEmbed[0]);
      dropdown.onChange((val) => {
        settings.embeddingModel = val;
        void host.saveSettings();
      });
    });
  } else {
    embedModelSetting.addText((text) =>
      text
        .setPlaceholder("bge-m3")
        .setValue(settings.embeddingModel || "bge-m3")
        .onChange((value) => {
          settings.embeddingModel = value.trim();
          void host.saveSettings();
        })
    );
  }

  new Setting(containerEl)
    .setName("Gesamtes Vault lokal indizieren")
    .setDesc("Berechnet Embeddings und Graph-Verknüpfungen für alle Notizen und speichert sie in der lokalen SQLite-Datenbank.")
    .addButton((btn) =>
      btn
        .setButtonText("Jetzt Vault lokal indizieren")
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Indiziere Vault...");
          btn.setDisabled(true);
          try {
            const totalFiles = app.vault.getMarkdownFiles().length;
            new Notice(`[INFO] Starte lokale Vektor- und Graph-Indizierung für ${totalFiles} Notizen...`);
            const vectorStore = getVectorStore(app, settings);
            const graphStore = getGraphStore(app, settings);
            const vecResult = await syncVaultVectors(app, settings, vectorStore);
            const graphResult = await syncVaultGraph(app, graphStore);
            btn.setButtonText("[OK] Indiziert!");
            new Notice(`[OK] ${vecResult.syncedCount} Vektoren & ${graphResult.edgeCount} Kanten erfolgreich in lokaler SQLite gespeichert!`);
          } catch (err) {
            btn.setButtonText("[ERROR] Fehlgeschlagen");
            new Notice(`[ERROR] Sync-Fehler: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            window.setTimeout(() => {
              btn.setButtonText("Jetzt Vault lokal indizieren");
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );
}
