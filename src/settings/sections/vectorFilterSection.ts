import { Notice, Setting } from "obsidian";
import { fetchProviderModels } from "../../llm/fetchProviderModels";
import type { TranslationKeys } from "../../i18n";
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

export function renderVectorFilterSection(
  containerEl: HTMLElement,
  host: SettingsHost,
  t: TranslationKeys,
  rerender: () => void
): void {
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
            settings.embeddingApiKey = defaults.embeddingApiKey;
            settings.embeddingModel = defaults.embeddingModel;
          }
          await host.saveSettings();
          rerender();
        })
    );

  new Setting(containerEl)
    .setName(t.embedApiBaseName)
    .setDesc(t.embedApiBaseDesc)
    .addText((text) =>
      text
        .setPlaceholder("http://localhost:11434/v1")
        .setValue(settings.embeddingApiBaseUrl || "http://localhost:11434/v1")
        .onChange(async (value) => {
          settings.embeddingApiBaseUrl = value.trim();
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.embedApiKeyName)
    .setDesc(t.embedApiKeyDesc)
    .addText((text) =>
      text
        .setPlaceholder("sk-... / ollama")
        .setValue(settings.embeddingApiKey || "ollama")
        .onChange(async (value) => {
          settings.embeddingApiKey = value.trim();
          await host.saveSettings();
        })
    );

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
            const models = await fetchProviderModels(settings.embeddingApiBaseUrl, settings.embeddingApiKey);
            btn.setButtonText("✅ Erfolgreich!");
            new Notice(`✅ Embedding-Verbindung erfolgreich! ${models.length} Modelle gefunden.`);
            if (models.length > 0) {
              settings.fetchedEmbedModels = models;
              if (!models.includes(settings.embeddingModel)) {
                settings.embeddingModel = models[0];
              }
              await host.saveSettings();
              rerender();
            }
          } catch (err) {
            btn.setButtonText("❌ Fehlgeschlagen");
            new Notice(`❌ Embedding-Verbindung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setTimeout(() => {
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
      fetchedEmbed.forEach((m) => dropdown.addOption(m, m));
      dropdown.setValue(settings.embeddingModel || fetchedEmbed[0]);
      dropdown.onChange(async (val) => {
        settings.embeddingModel = val;
        await host.saveSettings();
      });
    });
  } else {
    embedModelSetting.addText((text) =>
      text
        .setPlaceholder("bge-m3")
        .setValue(settings.embeddingModel || "bge-m3")
        .onChange(async (value) => {
          settings.embeddingModel = value.trim();
          await host.saveSettings();
        })
    );
  }

  new Setting(containerEl)
    .setName(t.exclusionsName)
    .setDesc(t.exclusionsDesc)
    .addText((text) =>
      text
        .setPlaceholder("-path:schema -file:index -file:log -file:README")
        .setValue(settings.vectorSearchExclusions || "")
        .onChange(async (value) => {
          settings.vectorSearchExclusions = value;
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.agentsPathsName)
    .setDesc(t.agentsPathsDesc)
    .addText((text) =>
      text
        .setPlaceholder("AGENTS.md, meta/PROFILE.md")
        .setValue(settings.agentsGuidelinePaths || "")
        .onChange(async (value) => {
          settings.agentsGuidelinePaths = value;
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.radarCountName)
    .setDesc(t.radarCountDesc)
    .addText((text) =>
      text
        .setPlaceholder("10")
        .setValue(String(settings.radarNoteCount || 10))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!Number.isNaN(num) && num > 0) {
            settings.radarNoteCount = num;
            await host.saveSettings();
          }
        })
    );

  new Setting(containerEl)
    .setName("Synthese WikiLink-Strategie")
    .setDesc("Bestimmt, wie KI-Synthesen WikiLinks handhaben, um blinde/leere Links im Vault zu vermeiden.")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("suggested_section", "Nur existierende verlinken + Neue als Lücken-Abschnitt am Ende (Empfohlen)")
        .addOption("existing_only", "Strikt nur existierende Vault-Notizen verlinken (Keine blinden Links)")
        .addOption("all_concepts", "Alle Konzepte verlinken (Inkl. neuer Platzhalter-Links)")
        .setValue(settings.synthesisLinkMode || "suggested_section")
        .onChange(async (value) => {
          settings.synthesisLinkMode = value;
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName("Themen-Wolken Namensgebung")
    .setDesc("Wähle, wie die Titel der Themen-Wolken im 2D-Vektorraum benannt werden: Nach der zentralen Anker-Notiz oder per KI/LLM Synthese.")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("centroid", "Schwerpunkt (Titel der zentralen Anker-Notiz)")
        .addOption("llm", "KI / LLM (Automatisch generierte Oberbegriffe)")
        .setValue(settings.cloudNamingMode || "centroid")
        .onChange(async (value) => {
          settings.cloudNamingMode = value;
          await host.saveSettings();
        })
    );
}
