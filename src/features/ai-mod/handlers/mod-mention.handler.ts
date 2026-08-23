import type { Message, TextChannel, Guild } from "discord.js";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { env } from "@/config/env";
import { isIgnored } from "@/core/discord/ignored-channels";
import { logger } from "@/core/logger";
import { safeDelete, safeTimeout, extractImageUrls } from "@/core/discord/moderation";
import { LogChannelService } from "@/features/log-channel";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { extractPuffContent } from "@/features/puff";
import { ImageService, ImageHashService } from "@/features/images";

import { AiModConfigService } from "../services/ai-mod-config.service";
import { ModRoleService } from "../services/mod-role.service";
import { SelfpromoBypassService } from "../services/selfpromo-bypass.service";
import { NotifyTargetsService } from "../services/notify-targets.service";
import { ContextBuilderService } from "../services/context-builder.service";
import { classifyBatch } from "../services/classifier.service";
import { ImageDuplicateService } from "../services/image-duplicate.service";
import { CasesService } from "../services/cases.service";
import { SanctionCache } from "../services/sanction-cache.service";
import {
  buildFlaggedEmbed,
  buildPrecautionEmbed,
  buildPingString,
} from "../services/alert-builder.service";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_THRESHOLD = 0.5;
const CANDIDATE_LIMIT = 10;
const BYPASS_PLATFORMS = new Set([1, 2, 3]);
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

interface FlaggedCandidate {
  message: Message;
  verdict: 1 | 2;
  confidence: number;
  platform: number;
  reason: string;
  fromImage: boolean;
  crossChannelMessages?: Message[];
}

interface PrecautionCandidate {
  message: Message;
  verdict: number;
  confidence: number;
  platform: number;
  reason: string;
}

export async function handleModMention(message: Message): Promise<void> {
  try {
    if (!message.guild) return;
    const guildId = message.guild.id;
    if (message.author.bot) return;

    // If the reporter already has ManageMessages, they can handle it themselves.
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const parentId = "parentId" in message.channel
      ? (message.channel.parentId ?? null)
      : null;
    if (await isIgnored(guildId, { id: message.channelId, parentId })) return;

    if (!env.AI_API_URL || !env.AI_API_KEY) {
      logger.warn("ai-mod: AI env missing, feature disabled");
      return;
    }

    const enabled = await AiModConfigService.isEnabled(guildId);
    if (!enabled) return;

    // Mod-role trigger: any mentioned role registered as a mod role.
    const mentionedRoleIds = [...message.mentions.roles.keys()];
    if (mentionedRoleIds.length === 0) return;
    const isModMention = await Promise.all(
      mentionedRoleIds.map((rid) => ModRoleService.hasRole(guildId, rid)),
    );
    if (!isModMention.some(Boolean)) return;

    const lang = await LanguageService.getLanguage(guildId);
    const t = getTranslation(lang);

    const candidates = await resolveCandidates(message);
    if (candidates.length === 0) return;

    const textCandidates: { index: number; content: string; message: Message }[] = [];
    const imageCandidates: Message[] = [];
    for (const m of candidates) {
      const content = extractPuffContent(m);
      if (!content) continue;
      if (content.kind === "image") {
        imageCandidates.push(m);
      } else if (content.kind === "text" && content.text) {
        textCandidates.push({ index: textCandidates.length, content: content.text, message: m });
      }
    }

    const flagged: FlaggedCandidate[] = [];
    const precautionCandidates: PrecautionCandidate[] = [];

    // Text route: one AI call.
    if (textCandidates.length > 0) {
      const context = await ContextBuilderService.buildContext(guildId);
      const result = await classifyBatch(
        guildId,
        textCandidates.map((c) => ({ index: c.index, content: c.content })),
        lang,
        context,
      );
      if (!result.ok) {
        logger.warn(`ai-mod: classification failed for report ${message.id}; no action taken`);
        return;
      } else {
        for (const entry of result.entries) {
          if (entry.v === 0) continue;
          if (entry.c < ALERT_THRESHOLD) continue;
          const matched = textCandidates.find((c) => c.index === entry.index);
          if (!matched) continue;
          flagged.push({
            message: matched.message,
            verdict: entry.v as 1 | 2,
            confidence: entry.c,
            platform: entry.p,
            reason: entry.r,
            fromImage: false,
          });
        }
      }
    }

    // Image route: novel images (known DB hashes are monitorImages' job).
    // Always act; sweep cross-channel only when ≥3 channels flagged.
    for (const imgMsg of imageCandidates) {
      const dup = await ImageDuplicateService.checkImage(message.guild, imgMsg);
      flagged.push({
        message: imgMsg,
        verdict: 1,
        confidence: dup.flagged ? 1 : 0.5,
        platform: 0,
        reason: dup.flagged
          ? dup.reason || t.aiMod.reason_image_spread
          : t.aiMod.reason_image_no_spread,
        fromImage: true,
        crossChannelMessages: dup.flagged ? dup.matchedMessages : undefined,
      });
    }

    // Apply bypass; any remaining flag is actionable (no alert-only band).
    const actionable: FlaggedCandidate[] = [];
    for (const f of flagged) {
      if (f.verdict === 2 && BYPASS_PLATFORMS.has(f.platform)) {
        const inBypass = await SelfpromoBypassService.isBypass(guildId, f.message.channelId);
        if (inBypass) continue; // allowed self-promo: no log, no action
      }
      actionable.push(f);
    }

    // Group actionable candidates by author so the same user gets one alert + one
    // case row per call (and cross-channel matches are all swept together).
    const buckets = new Map<string, FlaggedCandidate[]>();
    for (const f of actionable) {
      const list = buckets.get(f.message.author.id) ?? [];
      list.push(f);
      buckets.set(f.message.author.id, list);
    }

    for (const [authorId, bucket] of buckets) {
      const primary = bucket[0];
      const crossChannel: Message[] = [];
      for (const f of bucket) {
        if (f.crossChannelMessages) crossChannel.push(...f.crossChannelMessages);
      }

      await sweepCrossChannelMessages(message.guild, crossChannel);

      let actionLabel = t.aiMod.action_timeout;
      try {
        const member = await message.guild.members.fetch(authorId).catch(() => null);
        if (member) {
          if (member.isCommunicationDisabled()) {
            actionLabel = t.aiMod.action_already_timeout;
          } else {
            const ok = await safeTimeout(member, ONE_DAY_MS, `ai-mod: ${primary.reason}`);
            if (!ok) actionLabel = t.aiMod.action_no_permission;
          }
        }
      } catch (e) {
        logger.warn(`ai-mod: timeout attempt failed: ${e}`);
        actionLabel = t.aiMod.action_no_permission;
      }

      const byId = new Map<string, Message>();
      for (const m of [primary.message, ...bucket.map((f) => f.message), ...crossChannel]) {
        byId.set(m.id, m);
      }
      const toDelete = [primary.message, ...bucket.map((f) => f.message)];
      await Promise.all(toDelete.map((m) => safeDelete(m)));

      for (const f of bucket) {
        if (f.fromImage) await persistScamImage(guildId, f.message);
      }

      const cached = SanctionCache.get(guildId, authorId);
      if (cached) continue;

      const caseId = await CasesService.insert({
        guildId,
        authorId,
        channelId: primary.message.channelId,
        messageId: primary.message.id,
        content: primary.message.content || "(image)",
        verdict: primary.verdict,
        confidence: primary.confidence,
        platform: primary.platform,
        reason: primary.reason,
        actionTaken: actionLabel,
      });
      SanctionCache.set(guildId, authorId, caseId, primary.message.channelId);
      await sendFlaggedAlert(message, guildId, t, primary, actionLabel, caseId);
    }

    // Precaution alert (inconclusive + borderline), only if none actionable.
    if (precautionCandidates.length > 0 && actionable.length === 0) {
      const precautionWithCase = await Promise.all(
        precautionCandidates.map(async (pc) => {
          const caseId = await CasesService.insert({
            guildId,
            authorId: pc.message.author.id,
            channelId: pc.message.channelId,
            messageId: pc.message.id,
            content: pc.message.content || "(image)",
            verdict: pc.verdict,
            confidence: pc.confidence,
            platform: pc.platform,
            reason: pc.reason,
            actionTaken: t.aiMod.action_alert_only,
          });
          return {
            url: pc.message.url,
            authorTag: pc.message.author.tag,
            caseId,
          };
        }),
      );
      await sendPrecautionAlert(message, guildId, t, precautionWithCase);
    }
  } catch (e) {
    logger.error(`ai-mod: handleModMention error: ${e}`);
  }
}

async function resolveCandidates(message: Message): Promise<Message[]> {
  // Reply branch: the single replied message.
  if (message.reference?.messageId) {
    try {
      const ref = await message.channel.messages.fetch(message.reference.messageId);
      if (ref.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return [];
      return [ref];
    } catch (e) {
      logger.warn(`ai-mod: reply fetch failed, falling back to last-10: ${e}`);
    }
  }
  // No-reply branch: last 10, minus reporter and bots.
  try {
    const fetched = await message.channel.messages.fetch({ limit: CANDIDATE_LIMIT });
    const out: Message[] = [];
    for (const [, m] of fetched) {
      if (m.id === message.id) continue;
      if (m.author.id === message.author.id) continue;
      if (m.author.bot) continue;
      if (m.member?.permissions.has(PermissionFlagsBits.ManageMessages)) continue;
      out.push(m);
    }
    return out;
  } catch (e) {
    logger.warn(`ai-mod: failed to fetch candidates: ${e}`);
    return [];
  }
}

async function persistScamImage(guildId: string, message: Message): Promise<void> {
  const urls: string[] = [];
  for (const att of message.attachments.values()) {
    if (att.contentType?.startsWith("image/")) urls.push(att.url);
  }
  urls.push(...extractImageUrls(message.content));
  for (let i = 0; i < urls.length; i++) {
    try {
      const fp = await ImageHashService.downloadFingerprint(urls[i]);
      if (!fp) continue;
      await ImageService.addImage(guildId, `aimod-${message.id}-${i}`, urls[i]);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (!reason.includes("already exists")) {
        logger.warn(`ai-mod: failed to persist scam image: ${reason}`);
      }
    }
  }
}

async function sweepCrossChannelMessages(
  guild: Guild,
  messages: Message[],
): Promise<void> {
  if (messages.length === 0) return;
  const seen = new Set<string>();
  const byChannel = new Map<string, Message[]>();
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const list = byChannel.get(m.channelId) ?? [];
    list.push(m);
    byChannel.set(m.channelId, list);
  }
  for (const [channelId, msgs] of byChannel) {
    try {
      const channel = await guild.channels.fetch(channelId);
      if (!channel || !("bulkDelete" in channel)) continue;
      const now = Date.now();
      const young = msgs.filter((m) => now - m.createdTimestamp < FOURTEEN_DAYS_MS);
      const old = msgs.filter((m) => now - m.createdTimestamp >= FOURTEEN_DAYS_MS);
      if (young.length > 0) {
        await (channel as unknown as { bulkDelete: (ids: string[]) => Promise<unknown> }).bulkDelete(
          young.map((m) => m.id),
        );
      }
      await Promise.all(old.map((m) => safeDelete(m)));
    } catch (e) {
      logger.warn(`ai-mod: cross-channel sweep failed for ${channelId}: ${e}`);
    }
  }
}

async function sendFlaggedAlert(
  trigger: Message,
  guildId: string,
  t: ReturnType<typeof getTranslation>,
  f: FlaggedCandidate,
  actionLabel: string,
  caseId: number,
): Promise<void> {
  const logChannelId = await LogChannelService.getLogChannel(guildId);
  if (!logChannelId) {
    logger.warn(`ai-mod: flagged case ${caseId} but no log channel`);
    return;
  }
  const channel = await trigger.guild?.channels.fetch(logChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const targets = await NotifyTargetsService.list(guildId);
  const ping = buildPingString(targets);
  const { embed, components } = buildFlaggedEmbed(
    {
      caseId,
      authorTag: f.message.author.tag,
      authorId: f.message.author.id,
      channelId: f.message.channelId,
      content: f.message.content || "(imagen)",
      reportContent: trigger.content,
      confidence: f.confidence,
      platform: f.platform,
      verdict: f.verdict,
      reason: f.reason,
      actionLabel,
    },
    t,
  );
  await (channel as TextChannel).send({ content: ping || undefined, embeds: [embed], components });
}

async function sendPrecautionAlert(
  trigger: Message,
  guildId: string,
  t: ReturnType<typeof getTranslation>,
  candidates: { url: string; authorTag: string; caseId: number }[],
): Promise<void> {
  const logChannelId = await LogChannelService.getLogChannel(guildId);
  if (!logChannelId) {
    logger.warn("ai-mod: precaution needed but no log channel");
    return;
  }
  const channel = await trigger.guild?.channels.fetch(logChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const targets = await NotifyTargetsService.list(guildId);
  const ping = buildPingString(targets);
  const { embed, components } = buildPrecautionEmbed(candidates, t);
  await (channel as TextChannel).send({
    content: ping || undefined,
    embeds: [embed],
    components,
  });
}
