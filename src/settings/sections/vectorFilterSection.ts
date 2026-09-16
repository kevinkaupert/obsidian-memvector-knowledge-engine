import { Notice, SecretComponent, Setting, type App } from "obsidian";
import { fetchProviderModels } from "../../llm/fetchProviderModels";
import type { TranslationKeys } from "../../i18n";
import { getSelectedEmbeddingSecretName, resolveEmbeddingApiKey, setSelectedEmbeddingSecretName } from "../secrets";
import { getGraphStore, getVectorStore } from "../../sync/storeFactory";
import { syncVaultVectors } from "../../sync/vaultVectorSync";
import { syncVaultGraph } from "../../sync/vaultGraphSync";
import type { KnowledgeDomain, LlmProvider, SettingsHost } from "../types";

interface EmbeddingProviderDefaults {
  embeddingApiBaseUrl: string;
  embeddingModel: string;
}

const EMBEDDING_PROVIDER_DEFAULTS: Record<string, EmbeddingProviderDefaults> = {
  ollama: { embeddingApiBaseUrl: "http://localhost:11434/v1", embeddingModel: "bge-m3" },
  openai: { embeddingApiBaseUrl: "https://api.openai.com/v1", embeddingModel: "text-embedding-3-small" },
  custom: { embeddingApiBaseUrl: "http://localhost:8000/v1", embeddingModel: "custom-embed" },
};

/**
 * Purpose: Renders the knowledge domain, embedding provider, model selection, and vault-wide SQLite indexing section with localized strings.
 */
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
        .addOption("ollama", settings.language === "en" ? "Ollama (Local - http://localhost:11434/v1)" : "Ollama (Lokal - http://localhost:11434/v1)")
        .addOption("openai", "OpenAI Embeddings (api.openai.com)")
        .addOption("custom", "Custom REST Endpoint")
        .setValue(settings.embeddingProvider)
        .onChange(async (value) => {
          const defaults = EMBEDDING_PROVIDER_DEFAULTS[value];
          settings.embeddingProvider = value as LlmProvider;
          if (defaults) {
            settings.embeddingApiBaseUrl = defaults.embeddingApiBaseUrl;
            // Key itself is left untouched on provider switch - it's tied to whichever secret
            // the user selects below, not a value this dropdown can set (resolveEmbeddingApiKey
            // already falls back to the "ollama" placeholder when none is selected).
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
  new SecretComponent(app, embedKeySetting.controlEl)
    .setValue(getSelectedEmbeddingSecretName(settings))
    .onChange(async (secretName) => {
      setSelectedEmbeddingSecretName(settings, secretName);
      await host.saveSettings();
    });

  new Setting(containerEl)
    .setName(t.testEmbedConnTitle)
    .setDesc(t.testEmbedConnDesc)
    .addButton((btn) =>
      btn
        .setButtonText(t.testEmbedConnBtn)
        .setCta()
        .onClick(async () => {
          btn.setButtonText(t.testConnTesting);
          btn.setDisabled(true);
          try {
            const models = await fetchProviderModels(settings.embeddingApiBaseUrl, resolveEmbeddingApiKey(app, settings));
            btn.setButtonText(t.testConnSuccess);
            new Notice(`${t.testEmbedNoticeSuccess} ${models.length} ${t.testLlmNoticeModelsFound}`);
            if (models.length > 0) {
              settings.fetchedEmbedModels = models;
              if (!models.includes(settings.embeddingModel)) {
                settings.embeddingModel = models[0];
              }
              await host.saveSettings();
              rerender();
            }
          } catch (err) {
            btn.setButtonText(t.testConnFail);
            new Notice(`${t.testEmbedNoticeFail}: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            window.setTimeout(() => {
              btn.setButtonText(t.testEmbedConnBtn);
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
    .setName(t.indexVaultTitle)
    .setDesc(t.indexVaultDesc)
    .addButton((btn) =>
      btn
        .setButtonText(t.indexVaultBtn)
        .setCta()
        .onClick(async () => {
          btn.setButtonText(t.indexVaultIndexing);
          btn.setDisabled(true);
          try {
            const totalFiles = app.vault.getMarkdownFiles().length;
            new Notice(`[INFO] ${t.indexVaultNoticeStarting} ${totalFiles} ${settings.language === "en" ? "notes..." : "Notizen..."}`);
            const vectorStore = getVectorStore(app, settings);
            const graphStore = getGraphStore(app, settings);
            const vecResult = await syncVaultVectors(app, settings, vectorStore);
            const graphResult = await syncVaultGraph(app, graphStore, settings.vectorSearchExclusions);
            btn.setButtonText(t.indexVaultSuccess);
            new Notice(`[OK] ${vecResult.syncedCount} ${t.indexVaultNoticeSaved} ${graphResult.edgeCount} ${settings.language === "en" ? "edges saved successfully to local SQLite!" : "Kanten erfolgreich in lokaler SQLite gespeichert!"}`);
          } catch (err) {
            btn.setButtonText(t.testConnFail);
            new Notice(`[ERROR] Sync-Fehler: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            window.setTimeout(() => {
              btn.setButtonText(t.indexVaultBtn);
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );
}
