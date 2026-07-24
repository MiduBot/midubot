import { Message, PermissionFlagsBits } from "discord.js";
import { IgnoredChannelsService } from "../services/ignored-channels.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { isSuperdev } from "@/config/env";

export async function handleIgnorechannelCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const usage = t.aiMod.usage_ignorechannel.replace("{prefix}", prefix);

  if (!isSuperdev(message.author.id) && !message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply(t.aiMod.no_permission);
    return;
  }

  if (args.length < 2) {
    await message.reply(usage);
    return;
  }

  const sub = args[0].toLowerCase();
  const arg = args[1];
  const channelMention = arg.match(/^<#(\d+)>$/);
  const isChannel = !!channelMention;
  const targetId = channelMention ? channelMention[1] : /^\d{17,19}$/.test(arg) ? arg : null;
  if (!targetId) {
    await message.reply(usage);
    return;
  }
  const targetType = isChannel ? "channel" : "category";

  try {
    if (sub === "add") {
      await IgnoredChannelsService.add(guildId, targetId, targetType);
      await message.reply(t.aiMod.added);
    } else if (sub === "remove" || sub === "rm") {
      await IgnoredChannelsService.remove(guildId, targetId);
      await message.reply(t.aiMod.removed);
    } else {
      await message.reply(usage);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(msg.includes("Already") ? t.aiMod.already_present : t.commands.error);
  }
}
