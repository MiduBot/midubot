import { en } from "./en";
import { es } from "./es";

export type Language = "en" | "es";
export type Translations = typeof en;

const translations: Record<Language, Translations> = { en, es };

export function getTranslation(lang: Language): Translations {
  return translations[lang];
}
