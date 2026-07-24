import { Message } from "discord.js";
import { env, isSuperdev } from "@/config/env";
import { AIClientService } from "@/features/ai-mod";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";

const TEST_SYSTEM = "Responde de forma breve y concisa. No uses markdown.";
const TEST_USER = "Di 'La IA está funcionando correctamente' y nada más.";

export async function handleAiCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  const lang = guildId ? await LanguageService.getLanguage(guildId) : "es";
  const t = getTranslation(lang);

  if (!isSuperdev(message.author.id)) {
    await message.reply(t.ai.no_permission);
    return;
  }

  if (args.length < 1) {
    await message.reply(t.ai.usage.replace("{prefix}", prefix));
    return;
  }

  const sub = args[0].toLowerCase();
  if (sub !== "test") {
    await message.reply(t.ai.usage.replace("{prefix}", prefix));
    return;
  }

  await runTest(message, t);
}

async function runTest(
  message: Message,
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  const reply = await message.reply(t.ai.testing);
  const start = Date.now();

  try {
    const response = await AIClientService.chat(TEST_SYSTEM, TEST_USER);
    const elapsed = Date.now() - start;

    if (response === null) {
      await reply.edit(t.ai.fail);
      return;
    }

    await reply.edit(
      t.ai.ok
        .replace("{elapsed}", String(elapsed))
        .replace("{model}", env.AI_MODEL)
        .replace("{response}", response.slice(0, 1800)),
    );
  } catch (error) {
    logger.error("ai test command error", error);
    await reply.edit(t.ai.error);
  }
}
