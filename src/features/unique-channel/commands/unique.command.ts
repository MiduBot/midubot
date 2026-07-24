import { Message } from "discord.js";
import { UniqueChannelService } from "../services/unique-channel.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";

export async function handleUniqueCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  if (args.length < 1) {
    await message.reply(t.unique.usage.replace("{prefix}", prefix));
    return;
  }

  const subcommand = args[0].toLowerCase();

  try {
    if (subcommand === "set" || subcommand === "s") {
      await handleSet(message, guildId, args, t);
    } else if (subcommand === "emoji" || subcommand === "e") {
      await handleEmoji(message, guildId, args, t);
    } else if (subcommand === "reset" || subcommand === "r") {
      await handleReset(message, guildId, args, t);
    } else {
      await message.reply(t.unique.usage.replace("{prefix}", prefix));
    }
  } catch (error) {
    logger.error("Error handling unique command", error);
    await message.reply(t.commands.error);
  }
}

async function handleSet(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(t.unique.set_usage.replace("{prefix}", "m!"));
    return;
  }

  let channelId = args[1];

  if (channelId.startsWith("<#") && channelId.endsWith(">")) {
    channelId = channelId.slice(2, -1);
  }

  const channel = message.guild?.channels.cache.get(channelId);
  if (!channel) {
    await message.reply(t.commands.invalid_channel_id);
    return;
  }

  try {
    await UniqueChannelService.setChannel(guildId, channelId);
    await message.reply(t.unique.set_done.replace("{channelId}", channelId));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(t.unique.set_error.replace("{msg}", msg));
  }
}

async function handleEmoji(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(t.unique.emoji_usage);
    return;
  }

  const emoji = args[1];

  try {
    await UniqueChannelService.setEmoji(guildId, emoji);
    await message.reply(t.unique.emoji_done.replace("{emoji}", emoji));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(t.unique.emoji_error.replace("{msg}", msg));
  }
}

async function handleReset(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(t.unique.reset_usage);
    return;
  }

  let userId = args[1];

  if (userId.startsWith("<@!") && userId.endsWith(">")) {
    userId = userId.slice(3, -1);
  } else if (userId.startsWith("<@") && userId.endsWith(">")) {
    userId = userId.slice(2, -1);
  } else if (!/^\d+$/.test(userId)) {
    if (message.guild) {
      try {
        const results = await message.guild.members.fetch({ query: userId, limit: 1 });
        const member = results.first();
        if (member) {
          userId = member.id;
        } else {
          await message.reply(t.unique.user_not_found);
          return;
        }
      } catch {
        await message.reply(t.unique.user_not_found);
        return;
      }
    }
  }

  try {
    const result = await UniqueChannelService.resetUser(guildId, userId);

    if (!result.deleted) {
      await message.reply(t.unique.user_not_found);
      return;
    }

    await message.reply(t.unique.reset_done);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(t.unique.reset_error.replace("{msg}", msg));
  }
}
