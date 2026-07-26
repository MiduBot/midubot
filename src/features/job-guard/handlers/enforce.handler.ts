import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
} from "discord.js";
import { env } from "@/config/env";
import { classify, type ClassifyResult } from "../services/classifier.service";
import { JobGuardCasesService } from "../services/cases.service";
import { safeDelete } from "@/core/discord/moderation";
import { LogChannelService } from "@/features/log-channel";
import { logger } from "@/core/logger";

const BLOCK_THRESHOLD = 0.8;
const MAX_INPUT = 4000;

export async function enforceJobGuard(message: Message): Promise<void> {
  if (!env.JOB_CHANNEL_ID || !env.AI_API_URL || !env.AI_API_KEY) return;
  if (message.channelId !== env.JOB_CHANNEL_ID) return;
  if (!message.guild) return;

  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const content = message.content?.trim();
  if (!content) return;

  const result = await classify(content.slice(0, MAX_INPUT), message.guild.id);
  if (!result.ok || result.verdict !== "block") return;

  const shouldDelete = (result.confidence ?? 0) >= BLOCK_THRESHOLD;
  const deleted = shouldDelete ? await safeDelete(message) : false;

  let caseId = 0;
  try {
    caseId = await JobGuardCasesService.insert({
      guildId: message.guild.id,
      authorId: message.author.id,
      channelId: message.channelId,
      messageId: message.id,
      content: content.slice(0, MAX_INPUT),
      verdict: "block",
      confidence: result.confidence ?? 0,
      reason: result.reason ?? "",
      deleted,
    });
    if (caseId === 0) {
      logger.warn("job-guard: case insert returned no id");
    }
  } catch (e) {
    logger.warn(`job-guard: failed to insert case: ${e}`);
  }

  await notifyMods(message, content, result, deleted, caseId);
}

async function notifyMods(
  message: Message,
  originalText: string,
  result: ClassifyResult,
  deleted: boolean,
  caseId: number,
): Promise<void> {
  try {
    const guildId = message.guild!.id;
    const logChannelId = await LogChannelService.getLogChannel(guildId);
    if (!logChannelId) {
      logger.warn(
        `job-guard: block (deleted=${deleted}) but no log channel; author=${message.author.id}`,
      );
      return;
    }

    const logChannel = await message.guild!.channels.fetch(logChannelId);
    if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

    // ponytail: alerta en español hardcoded; i18n si algún día hace falta.
    const embed = new EmbedBuilder()
      .setColor(deleted ? 0xff4d4d : 0xffaa00)
      .setTitle(
        deleted ? "🚫 Oferta de empleo eliminada" : "⚠️ Posible oferta de empleo",
      )
      .setDescription(originalText.slice(0, 1024))
      .addFields(
        {
          name: "Autor",
          value: `${message.author.username} (${message.author.id})`,
          inline: true,
        },
        { name: "Canal", value: `<#${message.channelId}>`, inline: true },
        {
          name: "Confianza",
          value: `${Math.round((result.confidence ?? 0) * 100)}%`,
          inline: true,
        },
        { name: "Razón AI", value: (result.reason || "—").slice(0, 1024) },
        {
          name: "Acción",
          value: deleted ? "Mensaje eliminado" : "No eliminado (revisar)",
        },
      )
      .setTimestamp();

    const embedWithFooter =
      caseId > 0
        ? embed.setFooter({ text: `case_id: ${caseId}` })
        : embed;

    const sendPayload: {
      embeds: ReturnType<EmbedBuilder["setTimestamp"]>[];
      components?: ActionRowBuilder<ButtonBuilder>[];
    } = { embeds: [embedWithFooter] };

    if (caseId > 0) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`jobguard_${caseId}_correct`)
          .setLabel("Correcto")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`jobguard_${caseId}_incorrect`)
          .setLabel("Incorrecto")
          .setStyle(ButtonStyle.Danger),
      );
      sendPayload.components = [row];
    }

    await logChannel.send(sendPayload);
  } catch (e) {
    logger.warn(`job-guard: failed to notify mods: ${e}`);
  }
}
