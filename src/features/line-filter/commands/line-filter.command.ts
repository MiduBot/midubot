import { Message } from "discord.js";
import { LineFilterService } from "../services/line-filter.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";

export async function handleLineFilterCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  if (!message.guild) return;
  const guildId = message.guild.id;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  if (args.length < 1) {
    await message.reply(t.linefilter.usage.replace("{prefix}", prefix));
    return;
  }

  const sub = args[0].toLowerCase();

  try {
    if (sub === "on") {
      await LineFilterService.setEnabled(guildId, true);
      await message.reply(t.linefilter.enabled);
    } else if (sub === "off") {
      await LineFilterService.setEnabled(guildId, false);
      await message.reply(t.linefilter.disabled);
    } else if (sub === "threshold" || sub === "t") {
      if (args.length < 2) {
        await message.reply(t.linefilter.invalid_threshold);
        return;
      }
      const n = parseInt(args[1], 10);
      if (isNaN(n) || n < 5 || n > 200) {
        await message.reply(t.linefilter.invalid_threshold);
        return;
      }
      await LineFilterService.setThreshold(guildId, n);
      await message.reply(t.linefilter.threshold_set.replace("{n}", String(n)));
    } else if (sub === "risk" || sub === "r") {
      if (args.length < 2) {
        await message.reply(t.linefilter.invalid_risk);
        return;
      }
      const n = parseInt(args[1], 10);
      if (isNaN(n) || n < 1 || n > 10) {
        await message.reply(t.linefilter.invalid_risk);
        return;
      }
      await LineFilterService.setRiskLimit(guildId, n);
      await message.reply(t.linefilter.risk_set.replace("{n}", String(n)));
    } else if (sub === "exempt" || sub === "e") {
      await handleExempt(message, args, guildId, t);
    } else if (sub === "status" || sub === "s") {
      await handleStatus(message, guildId, t);
    } else {
      await message.reply(t.linefilter.usage.replace("{prefix}", prefix));
    }
  } catch (error) {
    logger.error("Error handling linefilter command", error);
    await message.reply(t.commands.error);
  }
}

async function handleExempt(
  message: Message,
  args: string[],
  guildId: string,
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(t.linefilter.usage.replace("{prefix}", "m!"));
    return;
  }

  const action = args[1].toLowerCase();

  if (action === "list" || action === "l") {
    const cfg = await LineFilterService.getConfig(guildId);
    const list = Array.from(cfg.exemptChannels);
    if (list.length === 0) {
      await message.reply(
        `${t.linefilter.status_exempt}: ${t.linefilter.status_none}`,
      );
    } else {
      await message.reply(
        `${t.linefilter.status_exempt}: ${list.map((id) => `<#${id}>`).join(", ")}`,
      );
    }
    return;
  }

  if (
    action !== "add" &&
    action !== "remove" &&
    action !== "a" &&
    action !== "r"
  ) {
    await message.reply(t.linefilter.usage.replace("{prefix}", "m!"));
    return;
  }

  if (args.length < 3) {
    await message.reply(t.linefilter.usage.replace("{prefix}", "m!"));
    return;
  }

  let channelId = args[2];
  if (channelId.startsWith("<#") && channelId.endsWith(">")) {
    channelId = channelId.slice(2, -1);
  }

  const channel = message.guild?.channels.cache.get(channelId);
  if (!channel) {
    await message.reply(t.linefilter.channel_not_found);
    return;
  }

  const isAdd = action === "add" || action === "a";
  if (isAdd) {
    await LineFilterService.addExemptChannel(guildId, channelId);
    await message.reply(t.linefilter.exempt_added);
  } else {
    await LineFilterService.removeExemptChannel(guildId, channelId);
    await message.reply(t.linefilter.exempt_removed);
  }
}

async function handleStatus(
  message: Message,
  guildId: string,
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  const cfg = await LineFilterService.getConfig(guildId);
  const exempt = Array.from(cfg.exemptChannels);

  const embed = {
    color: cfg.enabled ? 0x00ff00 : 0xff0000,
    title: t.linefilter.status_title,
    fields: [
      {
        name: t.linefilter.status_enabled,
        value: cfg.enabled ? "✅" : "❌",
        inline: true,
      },
      {
        name: t.linefilter.status_threshold,
        value: String(cfg.threshold),
        inline: true,
      },
      {
        name: t.linefilter.status_risk_limit,
        value: String(cfg.riskLimit),
        inline: true,
      },
      {
        name: t.linefilter.status_exempt,
        value:
          exempt.length === 0
            ? t.linefilter.status_none
            : exempt.map((id) => `<#${id}>`).join(", "),
        inline: false,
      },
    ],
  };

  await message.reply({ embeds: [embed] });
}
