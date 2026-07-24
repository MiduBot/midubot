import { ChannelType, type Message } from "discord.js";
import {
  LinkCooldownService,
  formatDuration,
} from "../services/link-cooldown.service";
import { extractUrlsFromMessage } from "../utils/extract-urls";
import { hasPermission } from "@/core/discord/permissions";
import { LanguageService } from "@/features/language";
import { LogChannelService } from "@/features/log-channel";
import { getTranslation } from "@/i18n";
import { ModActionService } from "@/features/mod-actions";
import { logger } from "@/core/logger";

export async function enforceLinkCooldown(message: Message): Promise<void> {
  if (!message.guild) return;
  const guildId = message.guild.id;

  const config = await LinkCooldownService.getChannelConfig(
    guildId,
    message.channelId,
  );
  if (!config || !config.enabled) return;

  if (await hasPermission(message)) return;

  const urls = extractUrlsFromMessage(message);
  if (urls.length === 0) return;

  const result = await LinkCooldownService.checkAndRecord(
    guildId,
    message.channelId,
    message.author.id,
    urls,
    message.id,
  );

  if (result.allowed) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  ModActionService.logAction(
    guildId,
    "link_cooldown",
    message.author.id,
    null,
    result.reason ?? "cooldown",
    { blockedUrl: result.blockedUrl, retryAfterMs: result.retryAfterMs },
  );

  try {
    if (message.deletable) await message.delete();
  } catch (e) {
    logger.warn(`Failed to delete link-cooldown message ${message.id}: ${e}`);
  }

  const safeRetryMs = Number.isFinite(result.retryAfterMs ?? 0)
    ? (result.retryAfterMs as number)
    : (config.windowMs ?? 0);
  const retry = formatDuration(safeRetryMs);
  const warnKey =
    result.reason === "same_duplicate"
      ? "blocked_warn_same"
      : "blocked_warn_rate";
  const tmpl = t.linkcooldown[warnKey as keyof typeof t.linkcooldown] as string;
  const text = tmpl
    .replace("{user}", message.author.id)
    .replace("{retry}", retry);

  try {
    if (!message.channel.isSendable()) return;
    const warn = await message.channel.send(text);
    setTimeout(() => warn.delete().catch(() => {}), 5000);
  } catch (e) {
    logger.warn(`Failed to send link-cooldown warning: ${e}`);
  }

  try {
    const logChannelId = await LogChannelService.getLogChannel(guildId);
    if (!logChannelId) return;
    const logChannel = await message.guild.channels.fetch(logChannelId);
    if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

    const embed = buildLogEmbed(
      message,
      config,
      result.blockedUrl ?? "(unknown)",
      result.reason ?? "same_duplicate",
      safeRetryMs,
      t,
    );
    await logChannel.send({
      content: t.linkcooldown.log_notice,
      embeds: [embed],
    });
  } catch (e) {
    logger.warn(`Failed to send link-cooldown log: ${e}`);
  }
}

function buildLogEmbed(
  message: Message,
  config: { mode: string; maxLinks: number },
  blockedUrl: string,
  reason: "same_duplicate" | "rate_limit",
  retryAfterMs: number,
  t: ReturnType<typeof getTranslation>,
) {
  const titleKey = reason === "same_duplicate" ? "same_title" : "rate_title";
  return {
    color: 0xff5500,
    title: (t.linkcooldown as Record<string, string>)[titleKey],
    fields: [
      { name: "user", value: `<@${message.author.id}>`, inline: true },
      { name: "channel", value: `<#${message.channelId}>`, inline: true },
      {
        name: "mode",
        value: config.mode === "same" ? "same" : `any (${config.maxLinks})`,
        inline: true,
      },
      { name: "url", value: blockedUrl.slice(0, 1024), inline: false },
      {
        name: "retry_after",
        value: formatDuration(retryAfterMs),
        inline: true,
      },
      {
        name: "message_link",
        value: `[link](${message.url})`,
        inline: true,
      },
    ],
    footer: {
      text: `server=${message.guild?.id} user=${message.author.id}`,
    },
    timestamp: new Date().toISOString(),
  };
}
