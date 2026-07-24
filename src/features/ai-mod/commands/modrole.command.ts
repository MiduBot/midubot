import { Message, PermissionFlagsBits } from "discord.js";
import { ModRoleService } from "../services/mod-role.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { isSuperdev } from "@/config/env";

export async function handleModroleCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const usage = t.aiMod.usage_modrole.replace("{prefix}", prefix);

  if (!isSuperdev(message.author.id) && !message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply(t.aiMod.no_permission);
    return;
  }

  if (args.length < 2) {
    await message.reply(usage);
    return;
  }

  const sub = args[0].toLowerCase();
  const roleArg = args[1];
  const mention = roleArg.match(/^<@&(\d+)>$/);
  const roleId = mention ? mention[1] : /^\d{17,19}$/.test(roleArg) ? roleArg : null;
  if (!roleId) {
    await message.reply(usage);
    return;
  }

  try {
    if (sub === "add") {
      await ModRoleService.add(guildId, roleId);
      await message.reply(t.aiMod.added);
    } else if (sub === "remove" || sub === "rm") {
      await ModRoleService.remove(guildId, roleId);
      await message.reply(t.aiMod.removed);
    } else {
      await message.reply(usage);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(msg.includes("Already") ? t.aiMod.already_present : t.commands.error);
  }
}
