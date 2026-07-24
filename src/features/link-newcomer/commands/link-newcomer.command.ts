import { Message } from "discord.js";
import { LinkNewcomerService } from "../services/link-newcomer.service";
import { parseDuration, formatDuration } from "@/features/link-cooldown";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";

export async function handleLinkNewcomerCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  if (!message.guild) return;
  const guildId = message.guild.id;
  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  if (args.length < 1) {
    await message.reply(t.linknewcomer.usage.replace("{prefix}", prefix));
    return;
  }

  const sub = args[0].toLowerCase();

  try {
    if (sub === "on" || sub === "enable") {
      await LinkNewcomerService.setEnabled(guildId, true);
      await message.reply(t.linknewcomer.enabled);
    } else if (sub === "off" || sub === "disable") {
      await LinkNewcomerService.setEnabled(guildId, false);
      await message.reply(t.linknewcomer.disabled);
    } else if (sub === "threshold" || sub === "time" || sub === "t") {
      if (args.length < 2) {
        await message.reply(
          t.linknewcomer.threshold_usage.replace("{prefix}", prefix),
        );
        return;
      }

      const ms = parseDuration(args[1]);
      if (!ms || ms < 60_000 || ms > 365 * 24 * 60 * 60 * 1000) {
        await message.reply(t.linknewcomer.invalid_threshold);
        return;
      }

      await LinkNewcomerService.setThresholdMs(guildId, ms);
      await message.reply(
        t.linknewcomer.threshold_set.replace(
          "{threshold}",
          formatDuration(ms),
        ),
      );
    } else if (sub === "status" || sub === "s") {
      await handleStatus(message, guildId, t);
    } else {
      await message.reply(t.linknewcomer.usage.replace("{prefix}", prefix));
    }
  } catch (error) {
    logger.error("Error handling linknewcomer command", error);
    await message.reply(t.commands.error);
  }
}

async function handleStatus(
  message: Message,
  guildId: string,
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  const cfg = await LinkNewcomerService.getConfig(guildId);

  const embed = {
    color: cfg.enabled ? 0x00ff00 : 0xff0000,
    title: t.linknewcomer.status_title,
    fields: [
      {
        name: t.linknewcomer.status_enabled,
        value: cfg.enabled ? "✅" : "❌",
        inline: true,
      },
      {
        name: t.linknewcomer.status_threshold,
        value: formatDuration(cfg.thresholdMs),
        inline: true,
      },
    ],
  };

  await message.reply({ embeds: [embed] });
}
