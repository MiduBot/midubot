import { ChannelType, type Message, type GuildChannel } from "discord.js";
import { LinkNewcomerService } from "../services/link-newcomer.service";
import { extractUrlsFromMessage } from "@/features/link-cooldown/utils/extract-urls";
import { formatDuration } from "@/features/link-cooldown";
import { hasPermission } from "@/core/discord/permissions";
import { isIgnored } from "@/core/discord/ignored-channels";
import { safeDelete } from "@/core/discord/moderation";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { LogChannelService } from "@/features/log-channel";
import { ModActionService } from "@/features/mod-actions";
import { logger } from "@/core/logger";

export async function enforceLinkNewcomer(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const guildId = message.guild.id;
  const config = await LinkNewcomerService.getConfig(guildId);
  if (!config.enabled) return;

  if (await hasPermission(message)) return;

  const channel = message.channel as GuildChannel;
  if (
    await isIgnored(guildId, {
      id: message.channelId,
      parentId: channel.parentId ?? null,
    })
  ) {
    return;
  }

  const urls = extractUrlsFromMessage(message);
  if (urls.length === 0) return;

  const joinedAt = message.member?.joinedTimestamp;
  if (
    !joinedAt ||
    !LinkNewcomerService.isNewMember(joinedAt, config.thresholdMs)
  ) {
    return;
  }

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  const deleted = await safeDelete(message, t.linknewcomer.delete_reason);
  if (!deleted) {
    logger.warn(
      `Link newcomer filter wanted to delete ${message.id} but bot lacks perms`,
    );
    return;
  }

  ModActionService.logAction(
    guildId,
    "link_newcomer",
    message.author.id,
    null,
    t.linknewcomer.delete_reason,
    { thresholdMs: config.thresholdMs, url: urls[0] },
  );

  logger.warn(
    `Link newcomer filter triggered: user=${message.author.id} channel=${message.channelId} thresholdMs=${config.thresholdMs}`,
  );

  try {
    if (!message.channel.isSendable()) return;
    const remainingMs = Math.max(
      0,
      config.thresholdMs - (Date.now() - joinedAt),
    );
    const warning = await message.channel.send(
      t.linknewcomer.warn
        .replace("{user}", message.author.id)
        .replace("{remaining}", formatDuration(remainingMs)),
    );
    setTimeout(() => warning.delete().catch(() => {}), 5000);
  } catch (e) {
    logger.warn(`Failed to send link-newcomer warning: ${e}`);
  }

  await sendLog(message, config.thresholdMs, urls[0], t);
}

async function sendLog(
  message: Message,
  thresholdMs: number,
  blockedUrl: string,
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  try {
    const guildId = message.guild?.id;
    if (!guildId) return;

    const logChannelId = await LogChannelService.getLogChannel(guildId);
    if (!logChannelId) return;

    const logChannel = await message.guild?.channels.fetch(logChannelId);
    if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

    const embed = {
      color: 0xff5500,
      title: t.linknewcomer.log_title,
      fields: [
        { name: "user", value: `<@${message.author.id}>`, inline: true },
        { name: "channel", value: `<#${message.channelId}>`, inline: true },
        {
          name: "threshold",
          value: formatDuration(thresholdMs),
          inline: true,
        },
        {
          name: "url",
          value: blockedUrl.slice(0, 1024),
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    await logChannel.send({
      content: t.linknewcomer.log_notice,
      embeds: [embed],
    });
  } catch (e) {
    logger.warn(`Failed to send link-newcomer log: ${e}`);
  }
}
