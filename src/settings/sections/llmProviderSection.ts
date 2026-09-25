import { Notice, SecretComponent, Setting, type App } from "obsidian";
import { fetchProviderModels } from "../../llm/fetchProviderModels";
import { PROVIDER_DEFAULT_MODELS } from "../../llm/modelDefaults";
import type { TranslationKeys } from "../../i18n";
import { getSelectedLlmSecretName, resolveApiKeyFor, setSelectedLlmSecretName } from "../secrets";
import type { LlmProvider, SettingsHost } from "../types";

const PROVIDER_BASE_URLS: Record<LlmProvider, string> = {
  ollama: "http://localhost:11434/v1",
  claude: "https://api.anthropic.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  custom: "",
};

/**
 * Purpose: Renders the LLM provider configuration section with localized options, API key resolution, connection test, and model selection.
 */
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
        .addOption("ollama", t.provOllama)
        .addOption("claude", "Anthropic Claude (api.anthropic.com)")
        .addOption("deepseek", "DeepSeek Cloud (api.deepseek.com)")
        .addOption("openai", "OpenAI (api.openai.com)")
        .addOption("openrouter", "OpenRouter (openrouter.ai/api/v1)")
        .addOption("custom", t.provCustomRest)
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
    .setValue(getSelectedLlmSecretName(settings, settings.llmProvider))
    .onChange(async (secretName) => {
      setSelectedLlmSecretName(settings, settings.llmProvider, secretName);
      await host.saveSettings();
    });

  new Setting(containerEl)
    .setName(t.testLlmConnTitle)
    .setDesc(t.testLlmConnDesc)
    .addButton((btn) =>
      btn
        .setButtonText(t.testLlmConnBtn)
        .setCta()
        .onClick(async () => {
          btn.setButtonText(t.testConnTesting);
          btn.setDisabled(true);
          try {
            const models = await fetchProviderModels(settings.apiBaseUrl, resolveApiKeyFor(app, settings, settings.llmProvider), settings.llmProvider);
            btn.setButtonText(t.testConnSuccess);
            new Notice(`${t.testLlmNoticeSuccess} ${models.length} ${t.testLlmNoticeModelsFound}`);
            if (models.length > 0) {
              settings.fetchedLlmModels = models;
              if (!models.includes(settings.modelName)) {
                settings.modelName = models[0];
              }
              await host.saveSettings();
              rerender();
            }
          } catch (err) {
            btn.setButtonText(t.testConnFail);
            new Notice(`${t.testLlmNoticeFail}: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            window.setTimeout(() => {
              btn.setButtonText(t.testLlmConnBtn);
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
        ? `${t.temperatureDesc} ${t.temperatureAnthropicNote}`
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

  new Setting(containerEl)
    .setName(t.synthesisContentCapTitle)
    .setDesc(t.synthesisContentCapDesc)
    .addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text
        .setPlaceholder("0")
        .setValue(String(settings.synthesisContentCapChars ?? 0))
        .onChange(async (value) => {
          const parsed = parseInt(value, 10);
          settings.synthesisContentCapChars = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
          await host.saveSettings();
        });
    });

  new Setting(containerEl)
    .setName(t.hopLevelLimitTitle)
    .setDesc(t.hopLevelLimitDesc)
    .addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text
        .setPlaceholder("2")
        .setValue(String(settings.hopLevelNeighborLimit ?? 2))
        .onChange(async (value) => {
          const parsed = parseInt(value, 10);
          settings.hopLevelNeighborLimit = Number.isFinite(parsed) && parsed >= 0 ? parsed : 2;
          await host.saveSettings();
        });
    });

  new Setting(containerEl)
    .setName(t.vectorNeighborLimitTitle)
    .setDesc(t.vectorNeighborLimitDesc)
    .addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text
        .setPlaceholder("2")
        .setValue(String(settings.vectorNeighborLimit ?? 2))
        .onChange(async (value) => {
          const parsed = parseInt(value, 10);
          settings.vectorNeighborLimit = Number.isFinite(parsed) && parsed >= 0 ? parsed : 2;
          await host.saveSettings();
        });
    });

  new Setting(containerEl)
    .setName(t.minVectorSimTitle)
    .setDesc(t.minVectorSimDesc)
    .addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.max = "1";
      text.inputEl.step = "0.05";
      text
        .setPlaceholder("0.75")
        .setValue(String(settings.minVectorSimilarity ?? 0.75))
        .onChange(async (value) => {
          const parsed = parseFloat(value);
          settings.minVectorSimilarity = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.75;
          await host.saveSettings();
        });
    });

  new Setting(containerEl)
    .setName(t.totalContextLimitTitle)
    .setDesc(t.totalContextLimitDesc)
    .addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text
        .setPlaceholder("0")
        .setValue(String(settings.totalContextLimit ?? 0))
        .onChange(async (value) => {
          const parsed = parseInt(value, 10);
          settings.totalContextLimit = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
          await host.saveSettings();
        });
    });
}
