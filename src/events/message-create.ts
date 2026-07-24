import { Message } from "discord.js";
import { env } from "@/config/env";
import { getCommand } from "@/commands/registry";
import { sendHelpMessage } from "@/commands/help.command";
import { hasPermission } from "@/core/discord/permissions";
import { enforceUniqueChannel } from "@/features/unique-channel";
import { enforceLinkCooldown } from "@/features/link-cooldown";
import { enforceLinkNewcomer } from "@/features/link-newcomer";
import { applyLineFilter } from "@/features/line-filter";
import { enforceJobGuard } from "@/features/job-guard";
import { handleModMention } from "@/features/ai-mod";
import { monitorImages } from "@/features/images";
import { containsImageUrl } from "@/core/discord/moderation";
import { logger } from "@/core/logger";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import type { Client } from "discord.js";

async function getTranslationForMessage(
  message: Message,
): Promise<ReturnType<typeof getTranslation>> {
  const guildId = message.guild?.id;
  const lang = guildId ? await LanguageService.getLanguage(guildId) : "es";
  return getTranslation(lang);
}

export async function handleMessageCreate(
  message: Message,
  client: Client,
): Promise<void> {
  if (message.author.bot) return;

  if (message.content.startsWith(env.DISCORD_PREFIX)) {
    const args = message.content
      .slice(env.DISCORD_PREFIX.length)
      .trim()
      .split(/\s+/);
    const commandName = args.shift()?.toLowerCase();

    try {
      if (
        commandName === "help" ||
        commandName === "h" ||
        commandName === "?"
      ) {
        if (message.member) {
          await sendHelpMessage(message);
        }
        return;
      }

      const command = commandName ? getCommand(commandName) : undefined;
      const t = await getTranslationForMessage(message);

      if (!command) {
        await message.reply(
          t.commands.unknown.replace("{prefix}", env.DISCORD_PREFIX),
        );
        return;
      }

      if (command.name !== "eval" && !(await hasPermission(message))) {
        await message.reply(t.commands.whitelist_perms);
        return;
      }

      await command.execute(message, args, env.DISCORD_PREFIX);
    } catch (error) {
      logger.error("Error handling command", error);
      await message.reply(
        "Ocurrió un error al procesar tu comando. / An error occurred.",
      );
    }
    return;
  }

  if (message.guild) {
    await enforceUniqueChannel(message);
    await enforceLinkNewcomer(message);
    await enforceLinkCooldown(message);
    await applyLineFilter(message, client);
    await enforceJobGuard(message);
    await handleModMention(message);

    if (message.attachments.size > 0 || containsImageUrl(message.content)) {
      await monitorImages(message);
    }
  }
}
