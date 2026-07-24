import { Message } from "discord.js";
import { LanguageService } from "../services/language.service";
import { getTranslation, type Language } from "@/i18n";

export async function handleLangCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  if (!message.guild) return;

  const guildId = message.guild.id;
  const currLang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(currLang);

  if (args.length < 1 || (args[0] !== "en" && args[0] !== "es")) {
    await message.reply(
      t.commands.lang_usage.replace("{prefix}", prefix),
    );
    return;
  }

  const newLang = args[0] as Language;
  await LanguageService.setLanguage(guildId, newLang);

  await message.reply(
    newLang === "es"
      ? "✅ Idioma configurado a Español."
      : "✅ Language set to English.",
  );
}
