import { ChannelType, type Message } from "discord.js";
import { ImageService } from "../services/image.service";
import { ImageHashService } from "../services/hash.service";
import { LogChannelService } from "@/features/log-channel";
import { LanguageService } from "@/features/language";
import { hasPermission } from "@/core/discord/permissions";
import { getTranslation } from "@/i18n";
import { ModActionService } from "@/features/mod-actions";
import { logger } from "@/core/logger";
import { env } from "@/config/env";
import { containsImageUrl, extractImageUrls } from "@/core/discord/moderation";
import { isIgnored } from "@/core/discord/ignored-channels";

const isDev = env.NODE_ENV === "development";
const _24hoursInMs = 24 * 60 * 60 * 1000;

export async function monitorImages(message: Message): Promise<void> {
  if (!message.guild) return;

  if (
    await isIgnored(message.guild.id, {
      id: message.channelId,
      parentId: (message.channel as { parentId?: string | null } | null)?.parentId ?? null,
    })
  )
    return;

  const ignoreWhitelist = false;
  if ((await hasPermission(message)) && !isDev && !ignoreWhitelist) return;

  const ignoreModerators = true;
  if (
    message.member?.permissions.has("ManageMessages") &&
    ignoreModerators &&
    !isDev
  )
    return;

  const guildId = message.guild.id;
  const me = message.guild.members.me;
  if (!me) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  const images = await ImageService.listImages(guildId);
  if (images.length === 0) return;

  const imageUrls: string[] = [];

  for (const attachment of message.attachments.values()) {
    if (attachment.contentType?.startsWith("image/")) {
      imageUrls.push(attachment.url);
    }
  }

  imageUrls.push(...extractImageUrls(message.content));

  for (const imageUrl of imageUrls) {
    try {
      const fingerprint = await ImageHashService.downloadFingerprint(imageUrl);
      if (!fingerprint) continue;

      const similar = await ImageService.findSimilarImagesByFingerprint(
        guildId,
        fingerprint,
      );

      if (similar.length > 0) {
        const logChannelId = await LogChannelService.getLogChannel(guildId);

        if (logChannelId) {
          const logChannel = await message.guild.channels.fetch(logChannelId);

          if (logChannel && logChannel.type === ChannelType.GuildText) {
            const embeds = similar.map((img) => {
              const d = img.similarity.details;
              const mode = d.mode === "ensemble" ? "ensemble" : "legacy";
              const breakdown =
                d.mode === "ensemble"
                  ? `pHash: ${d.phashDist}/64 · dHash: ${d.dhashDist}/64 · aHash: ${d.ahashDist}/64 · color: ${d.colorDist.toFixed(1)}/255 · aspect Δ: ${(d.aspectDiff * 100).toFixed(1)}% · votes: ${d.votes}/3`
                  : `dHash: ${d.dhashDist}/64 (legacy strict)`;

              return {
                color: 0xff0000,
                title: t.monitor.duplicate_title,
                fields: [
                  {
                    name: t.monitor.detected_by,
                    value: `${message.author.tag}`,
                    inline: true,
                  },
                  {
                    name: t.monitor.channel,
                    value: `<#${message.channelId}>`,
                    inline: true,
                  },
                  {
                    name: t.monitor.matched_image,
                    value: img.name,
                    inline: true,
                  },
                  {
                    name: t.monitor.similarity,
                    value: `${img.similarity.confidence}% (${mode})`,
                    inline: true,
                  },
                  {
                    name: t.monitor.match_breakdown,
                    value: breakdown,
                    inline: false,
                  },
                  {
                    name: t.monitor.original_url,
                    value: img.url,
                    inline: false,
                  },
                  {
                    name: t.monitor.detected_image,
                    value: imageUrl,
                    inline: false,
                  },
                  {
                    name: t.monitor.message_link,
                    value: `[Link](${message.url})`,
                    inline: false,
                  },
                ],
                footer: {
                  text: `${t.monitor.server}: ${message.guild!.name} | ${t.monitor.user_id}: ${message.author.id}`,
                },
                timestamp: new Date().toISOString(),
              };
            });

            try {
              const canTimeout = true;

              if (me.roles.cache.size === 0) {
                await me.fetch();
              }
              if (
                canTimeout &&
                message.member &&
                me.permissions.has("ModerateMembers") &&
                me.roles.highest.position >
                  message.member.roles.highest.position
              ) {
                await message.member
                  ?.timeout(_24hoursInMs, t.monitor.timeout_reason)
                  .catch((e) => {
                    logger.error("Failed to timeout user", e);
                  });
              }
              if (me.permissions.has("ManageMessages")) {
                await message.delete();
              }
              ModActionService.logAction(
                guildId,
                "image_duplicate",
                message.author.id,
                null,
                t.monitor.timeout_reason,
                { matchedImages: similar.map((s) => s.name) },
              );
              await logChannel.send({
                content: t.monitor.deleted_msg.replace(
                  "{id}",
                  message.author.id,
                ),
                embeds,
              });
            } catch (error) {
              logger.error("Failed to delete message or send log", error);
              await logChannel.send({
                content: t.monitor.failed_delete,
                embeds,
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error("Error processing image", error);
    }
  }
}

export { containsImageUrl };
