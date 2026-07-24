import { Message, PermissionFlagsBits } from "discord.js";
import { NotifyTargetsService, type NotifyTargetType } from "../services/notify-targets.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { isSuperdev } from "@/config/env";

export async function handleNotifyCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const usage = t.aiMod.usage_notify.replace("{prefix}", prefix);

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
  const roleMention = arg.match(/^<@&(\d+)>$/);
  const userMention = arg.match(/^<@!?(\d+)>$/);
  let targetId: string | null = null;
  let targetType: NotifyTargetType = "user";
  if (roleMention) {
    targetId = roleMention[1];
    targetType = "role";
  } else if (userMention) {
    targetId = userMention[1];
    targetType = "user";
  } else if (/^\d{17,19}$/.test(arg)) {
    targetId = arg;
    targetType = "user";
  }
  if (!targetId) {
    await message.reply(usage);
    return;
  }

  try {
    if (sub === "add") {
      await NotifyTargetsService.add(guildId, targetId, targetType);
      await message.reply(t.aiMod.added);
    } else if (sub === "remove" || sub === "rm") {
      await NotifyTargetsService.remove(guildId, targetId);
      await message.reply(t.aiMod.removed);
    } else {
      await message.reply(usage);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(msg.includes("Already") ? t.aiMod.already_present : t.commands.error);
  }
}
