import { de } from "./de";
import { en } from "./en";
import type { SupportedLanguage, TranslationKeys } from "./types";

export type { SupportedLanguage, TranslationKeys };

const translations: Record<SupportedLanguage, TranslationKeys> = { de, en };

/** Purpose: Fills the `{folder}` placeholder of a translated text with the configured vault folder. */
export function withFolder(text: string, folder: string): string {
  return text.split("{folder}").join(folder);
}

export function getTranslation(lang: string): TranslationKeys {
  return translations[lang as SupportedLanguage] || translations.de;
}
