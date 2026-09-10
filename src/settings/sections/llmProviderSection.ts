import { Notice, SecretComponent, Setting, type App } from "obsidian";
import { fetchProviderModels } from "../../llm/fetchProviderModels";
import { PROVIDER_DEFAULT_MODELS } from "../../llm/modelDefaults";
import type { TranslationKeys } from "../../i18n";
import { getApiKeyFor, setApiKeyFor } from "../secrets";
import type { LlmProvider, SettingsHost } from "../types";

const PROVIDER_BASE_URLS: Record<LlmProvider, string> = {
  ollama: "http://localhost:11434/v1",
  claude: "https://api.anthropic.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  custom: "",
};

export function renderLlmProviderSection(
  containerEl: HTMLElement,
  app: App,
  host: SettingsHost,
  t: TranslationKeys,
  rerender: () => void
): void {
  const { settings } = host;
  containerEl.createEl("h3", { text: t.secLLM });

  new Setting(containerEl)
    .setName(t.llmProvName)
    .setDesc(t.llmProvDesc)
    .addDropdown((dropdown) =>
      dropdown
        .addOption("ollama", "Ollama (Lokal - http://localhost:11434/v1)")
        .addOption("claude", "Anthropic Claude (api.anthropic.com)")
        .addOption("deepseek", "DeepSeek Cloud (api.deepseek.com)")
        .addOption("openai", "OpenAI (api.openai.com)")
        .addOption("openrouter", "OpenRouter (openrouter.ai/api/v1)")
        .addOption("custom", "Custom REST Endpoint")
        .setValue(settings.llmProvider)
        .onChange(async (value) => {
          const provider = value as LlmProvider;
          settings.llmProvider = provider;
          // "custom" leaves URL/model untouched so the user can fill them in
          // manually below, matching the original behaviour.
          if (provider !== "custom") {
            settings.apiBaseUrl = PROVIDER_BASE_URLS[provider];
            // Bugfix #3: no longer wipes the key, per-provider keys persist independently.
            settings.modelName = PROVIDER_DEFAULT_MODELS[provider];
          }
          await host.saveSettings();
          rerender();
        })
    );

  new Setting(containerEl)
    .setName(t.apiBaseUrlName)
    .setDesc(t.apiBaseUrlDesc)
    .addText((text) => {
      text.inputEl.addClass("memvector-input-full");
      text
        .setPlaceholder("http://localhost:11434/v1")
        .setValue(settings.apiBaseUrl || "")
        .onChange(async (value) => {
          settings.apiBaseUrl = value.trim();
          await host.saveSettings();
        });
    });

  const apiKeySetting = new Setting(containerEl).setName(t.apiKeyName).setDesc(t.apiKeyDesc);
  new SecretComponent(app, apiKeySetting.controlEl)
    .setValue(getApiKeyFor(app, settings.llmProvider))
    .onChange((value) => setApiKeyFor(app, settings.llmProvider, value.trim()));

  new Setting(containerEl)
    .setName("LLM-Verbindung testen & Modelle abfragen")
    .setDesc("Prüft die API-Verbindung und lädt automatisch alle verfügbaren Sprachmodelle vom Provider.")
    .addButton((btn) =>
      btn
        .setButtonText("Verbindung testen & Modelle laden")
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Testen...");
          btn.setDisabled(true);
          try {
            const models = await fetchProviderModels(settings.apiBaseUrl, getApiKeyFor(app, settings.llmProvider), settings.llmProvider);
            btn.setButtonText("[OK] Erfolgreich!");
            new Notice(`[OK] LLM-Verbindung erfolgreich! ${models.length} Modelle gefunden.`);
            if (models.length > 0) {
              settings.fetchedLlmModels = models;
              if (!models.includes(settings.modelName)) {
                settings.modelName = models[0];
              }
              await host.saveSettings();
              rerender();
            }
          } catch (err) {
            btn.setButtonText("[ERROR] Fehlgeschlagen");
            new Notice(`[ERROR] LLM-Verbindung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            window.setTimeout(() => {
              btn.setButtonText("Verbindung testen & Modelle laden");
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );

  const fetchedLlm = settings.fetchedLlmModels || [];
  const modelSetting = new Setting(containerEl).setName(t.modelNameTitle).setDesc(t.modelNameDesc);

  if (fetchedLlm.length > 0) {
    modelSetting.addDropdown((dropdown) => {
      for (const m of fetchedLlm) {
        dropdown.addOption(m, m);
      }
      dropdown.setValue(settings.modelName || fetchedLlm[0]);
      dropdown.onChange((val) => {
        settings.modelName = val;
        void host.saveSettings();
      });
    });
  } else {
    modelSetting.addText((text) =>
      text
        .setPlaceholder("model-name")
        .setValue(settings.modelName || "")
        .onChange((value) => {
          settings.modelName = value.trim();
          void host.saveSettings();
        })
    );
  }

  const isAnthropicSelected = settings.llmProvider === "claude" || (settings.apiBaseUrl || "").toLowerCase().includes("anthropic");

  const tempSetting = new Setting(containerEl)
    .setName(t.temperatureTitle)
    .setDesc(
      isAnthropicSelected
        ? `${t.temperatureDesc} (Deaktiviert für Anthropic/Claude - wird vom API-Provider verwaltet)`
        : t.temperatureDesc
    )
    .addSlider((slider) =>
      slider
        .setLimits(0, 1, 0.05)
        .setValue(settings.temperature ?? 0.1)
        .setDisabled(isAnthropicSelected)
        .onChange(async (value) => {
          settings.temperature = value;
          await host.saveSettings();
        })
    );

  if (isAnthropicSelected) {
    tempSetting.settingEl.addClass("memvector-disabled-setting");
  }
}
