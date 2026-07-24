import { Message, ChannelType } from "discord.js";
import { LogChannelService } from "../services/log-channel.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";

export async function handleLogCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  if (args.length < 1) {
    await message.reply(t.commands.log_usage.replace("{prefix}", prefix));
    return;
  }

  const channelArg = args[0];
  const mentionMatch = channelArg.match(/^<#(\d+)>$/);
  let channelId: string | undefined;

  if (mentionMatch) {
    channelId = mentionMatch[1];
  } else if (/^\d{17,19}$/.test(channelArg)) {
    channelId = channelArg;
  } else {
    await message.reply(t.commands.invalid_channel_id);
    return;
  }

  const response = await message.reply(t.commands.log_setting);

  try {
    const channel = await message.guild?.channels
      .fetch(channelId)
      .catch(() => null);

    if (!channel) {
      await response.edit(t.commands.log_channel_not_found);
      return;
    }

    if (channel.type !== ChannelType.GuildText) {
      await response.edit(t.commands.log_must_be_text);
      return;
    }

    await LogChannelService.setLogChannel(guildId, channelId);
    await response.edit(t.commands.log_set.replace("{channelId}", channelId));
  } catch (error: unknown) {
    logger.error("Error setting log channel", error);
    const code = (error as { code?: number }).code;
    if (code === 10003) {
      await response.edit(t.commands.log_channel_not_found);
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      await response.edit(t.commands.log_error.replace("{msg}", msg));
    }
  }
}
