import { de } from "./de";
import { en } from "./en";
import type { SupportedLanguage, TranslationKeys } from "./types";

export type { SupportedLanguage, TranslationKeys };

const translations: Record<SupportedLanguage, TranslationKeys> = { de, en };

export function getTranslation(lang: string): TranslationKeys {
  return translations[lang as SupportedLanguage] || translations.de;
}
