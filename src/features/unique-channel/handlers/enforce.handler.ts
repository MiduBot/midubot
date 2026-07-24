import { type Message } from "discord.js";
import { UniqueChannelService } from "../services/unique-channel.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";

export async function enforceUniqueChannel(message: Message): Promise<void> {
  if (!message.guild) return;

  const guildId = message.guild.id;
  const config = await UniqueChannelService.getConfig(guildId);
  if (!config || message.channelId !== config.channelId) return;

  const userId = message.author.id;
  const existingMessageId = await UniqueChannelService.getUserMessage(
    guildId,
    userId,
  );

  if (existingMessageId) {
    try {
      if (!message.channel.isSendable()) throw new Error("channel not sendable");
      const oldMsg = await message.channel.messages.fetch(existingMessageId);
      if (oldMsg) {
        await message.delete();
        const lang = await LanguageService.getLanguage(guildId);
        const t = getTranslation(lang);
        const warning = await message.channel.send(
          t.unique.deleted_message.replace("{userId}", userId),
        );
        setTimeout(() => warning.delete().catch(() => {}), 5000);
        return;
      }
    } catch {
      await UniqueChannelService.resetUser(guildId, userId);
    }
  }

  try {
    await message.react(config.emoji);
  } catch {
    // bot may not have permission to react
  }

  await UniqueChannelService.setUserMessage(guildId, userId, message.id);
}
