import { AIClientService } from "./ai-client.service";

const LANG_WORD: Record<"es" | "en", string> = { es: "español", en: "inglés" };

const FP_SYSTEM_TEMPLATE = `Un moderador marcó como INCORRECTA tu clasificación de este mensaje.
Genera UNA nota de contexto breve (1-2 frases) que ayude a evitar el
mismo error en el futuro. No repitas el mensaje; describe el patrón.
Responde en {lang}. SOLO la nota, sin JSON ni markdown.`;

const TP_SYSTEM_TEMPLATE = `Un moderador confirmó que tu clasificación de este mensaje fue CORRECTA.
Genera UNA nota de contexto breve (1-2 frases) que describa el patrón
que hizo correcta esta clasificación, para reforzar ejemplos similares.
No repitas el mensaje; describe el patrón. Responde en {lang}. SOLO la
nota, sin JSON ni markdown.`;

function buildUserPrompt(content: string, v: number, c: number, r: string): string {
  return [
    `Mensaje clasificado: ${content}`,
    `Veredicto dado: ${v} (1=MALICIOUS, 2=SELFPROMO)`,
    `Confidence dado: ${c}`,
    `Razón dada: ${r}`,
  ].join("\n");
}

export class FeedbackService {
  static async generateAntiFpPrompt(
    content: string,
    v: number,
    c: number,
    r: string,
    lang: "es" | "en",
  ): Promise<string | null> {
    return FeedbackService.generateNote(FP_SYSTEM_TEMPLATE, buildUserPrompt(content, v, c, r), lang);
  }

  static async generateTruePositivePrompt(
    content: string,
    v: number,
    c: number,
    r: string,
    lang: "es" | "en",
  ): Promise<string | null> {
    return FeedbackService.generateNote(TP_SYSTEM_TEMPLATE, buildUserPrompt(content, v, c, r), lang);
  }

  private static async generateNote(
    systemTemplate: string,
    userPrompt: string,
    lang: "es" | "en",
  ): Promise<string | null> {
    const system = systemTemplate.replace("{lang}", LANG_WORD[lang]);
    const raw = await AIClientService.chat(system, userPrompt);
    if (raw === null) return null;
    const note = raw.trim();
    return note.length > 0 ? note : null;
  }
}
