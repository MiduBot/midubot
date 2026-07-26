import { AIClientService } from "@/features/ai-mod/services/ai-client.service";

const FP_SYSTEM = `Un moderador marcó como INCORRECTA tu clasificación de este mensaje del canal busca-trabajo.
Genera UNA nota breve (1-2 frases) para evitar el mismo error. No repitas el mensaje; describe el patrón.
Responde en español. SOLO la nota, sin JSON ni markdown.`;

const TP_SYSTEM = `Un moderador confirmó que tu clasificación de este mensaje del canal busca-trabajo fue CORRECTA.
Genera UNA nota breve (1-2 frases) que describa el patrón. No repitas el mensaje.
Responde en español. SOLO la nota, sin JSON ni markdown.`;

function buildUser(content: string, verdict: string, c: number, r: string): string {
  return [
    "Mensaje clasificado:",
    `<mensaje>\n${content}\n</mensaje>`,
    `Veredicto dado: ${verdict} (allow|block)`,
    `Confidence dado: ${c}`,
    `Razón dada: ${r}`,
  ].join("\n");
}

export class JobGuardFeedbackService {
  static async generateAntiFpPrompt(
    content: string,
    verdict: string,
    c: number,
    r: string,
  ): Promise<string | null> {
    const raw = await AIClientService.chat(FP_SYSTEM, buildUser(content, verdict, c, r));
    const note = raw?.trim() ?? "";
    return note.length > 0 ? note : null;
  }

  static async generateTruePositivePrompt(
    content: string,
    verdict: string,
    c: number,
    r: string,
  ): Promise<string | null> {
    const raw = await AIClientService.chat(TP_SYSTEM, buildUser(content, verdict, c, r));
    const note = raw?.trim() ?? "";
    return note.length > 0 ? note : null;
  }
}
