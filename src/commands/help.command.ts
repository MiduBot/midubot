import { Message } from "discord.js";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { env } from "@/config/env";
import { buildHelpView } from "./help";

export async function sendHelpMessage(message: Message): Promise<void> {
  const member = message.member;
  if (!member || !member.permissions.has("ManageMessages")) {
    const lang = message.guild?.id
      ? await LanguageService.getLanguage(message.guild.id)
      : "es";
    const t = getTranslation(lang);
    await message.reply({ content: t.help.not_allowed });
    return;
  }

  const lang = message.guild?.id
    ? await LanguageService.getLanguage(message.guild.id)
    : "es";

  const view = buildHelpView(
    { kind: "home" },
    lang,
    env.DISCORD_PREFIX,
    message.author.id,
  );

  await message.reply({
    embeds: view.embeds,
    components: view.components,
  });
}
