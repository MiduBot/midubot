import { ChannelType, type Message, type Client } from "discord.js";
import { db } from "@/db/connection";
import { guildConfigsTable } from "@/db/schema";
import { appCache } from "@/core/cache";
import { LogChannelService } from "@/features/log-channel";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { safeDelete } from "@/core/discord/moderation";
import { ModActionService } from "@/features/mod-actions";
import { logger } from "@/core/logger";
import { eq } from "drizzle-orm";

const CACHE_PREFIX = "linefilter:";
const CACHE_TTL_MS = 60 * 60 * 1000;

const DOC_URL_REGEX =
  /https?:\/\/(?:github\.com|stackoverflow\.com|developer\.mozilla\.org|npmjs\.com|docs\.\w+|git\.io|gitlab\.com)\b/i;
const CODE_BLOCK_REGEX = /```[\s\S]*?```/;
const KEYWORD_REGEX =
  /\b(oportunidad(?:es)?|trabajo remoto|ingresos?(?: pasivos)?|USD|\$\d{2,}|DM me|telegram\.me|wa\.me|whatsapp|💰|🤑|💸|linktr\.ee|t\.me|bit\.ly)\b/i;

export type LineFilterConfig = {
  enabled: boolean;
  threshold: number;
  riskLimit: number;
  exemptChannels: Set<string>;
};

type CachedConfig = {
  enabled: boolean;
  threshold: number;
  riskLimit: number;
  exemptChannels: string[];
};

export class LineFilterService {
  static async getConfig(guildId: string): Promise<LineFilterConfig> {
    const cacheKey = `${CACHE_PREFIX}${guildId}`;
    const cached = appCache.get<CachedConfig>(cacheKey);
    if (cached) {
      return {
        enabled: cached.enabled,
        threshold: cached.threshold,
        riskLimit: cached.riskLimit,
        exemptChannels: new Set(cached.exemptChannels),
      };
    }

    const row = await db.query.guildConfigsTable.findFirst({
      where: eq(guildConfigsTable.guildId, guildId),
    });

    const cfg: CachedConfig = {
      enabled: row?.lineFilterEnabled ?? false,
      threshold: row?.lineFilterThreshold ?? 20,
      riskLimit: row?.lineFilterRiskLimit ?? 3,
      exemptChannels: parseExemptChannels(row?.lineFilterExemptChannels),
    };
    appCache.set(cacheKey, cfg, CACHE_TTL_MS);

    return {
      enabled: cfg.enabled,
      threshold: cfg.threshold,
      riskLimit: cfg.riskLimit,
      exemptChannels: new Set(cfg.exemptChannels),
    };
  }

  static async setEnabled(guildId: string, enabled: boolean): Promise<void> {
    await db
      .insert(guildConfigsTable)
      .values({
        guildId,
        lineFilterEnabled: enabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: guildConfigsTable.guildId,
        set: { lineFilterEnabled: enabled, updatedAt: new Date() },
      });
    this.invalidate(guildId);
  }

  static async setThreshold(guildId: string, n: number): Promise<void> {
    await db
      .insert(guildConfigsTable)
      .values({ guildId, lineFilterThreshold: n, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: guildConfigsTable.guildId,
        set: { lineFilterThreshold: n, updatedAt: new Date() },
      });
    this.invalidate(guildId);
  }

  static async setRiskLimit(guildId: string, n: number): Promise<void> {
    await db
      .insert(guildConfigsTable)
      .values({ guildId, lineFilterRiskLimit: n, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: guildConfigsTable.guildId,
        set: { lineFilterRiskLimit: n, updatedAt: new Date() },
      });
    this.invalidate(guildId);
  }

  static async addExemptChannel(
    guildId: string,
    channelId: string,
  ): Promise<void> {
    const cfg = await this.getConfig(guildId);
    const arr = Array.from(cfg.exemptChannels);
    if (!arr.includes(channelId)) arr.push(channelId);
    const json = JSON.stringify(arr);
    await db
      .insert(guildConfigsTable)
      .values({
        guildId,
        lineFilterExemptChannels: json,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: guildConfigsTable.guildId,
        set: { lineFilterExemptChannels: json, updatedAt: new Date() },
      });
    this.invalidate(guildId);
  }

  static async removeExemptChannel(
    guildId: string,
    channelId: string,
  ): Promise<void> {
    const cfg = await this.getConfig(guildId);
    const arr = Array.from(cfg.exemptChannels).filter((id) => id !== channelId);
    const json = JSON.stringify(arr);
    await db
      .insert(guildConfigsTable)
      .values({
        guildId,
        lineFilterExemptChannels: json,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: guildConfigsTable.guildId,
        set: { lineFilterExemptChannels: json, updatedAt: new Date() },
      });
    this.invalidate(guildId);
  }

  static invalidate(guildId: string): void {
    appCache.delete(`${CACHE_PREFIX}${guildId}`);
  }

  static countLines(content: string): number {
    if (!content) return 0;
    return content.split(/\r\n|\r|\n/).length;
  }

  static hasCodeBlock(content: string): boolean {
    return CODE_BLOCK_REGEX.test(content);
  }

  static hasDocUrl(content: string): boolean {
    return DOC_URL_REGEX.test(content);
  }

  static hasSuspiciousKeywords(content: string): boolean {
    return KEYWORD_REGEX.test(content);
  }

  static async computeRiskScore(
    message: Message,
    config: LineFilterConfig,
  ): Promise<{ score: number; reasons: string[] }> {
    const content = message.content || "";
    const reasons: string[] = [];
    let score = 0;

    const lines = this.countLines(content);
    if (lines <= config.threshold) {
      return { score: 0, reasons: ["below_threshold"] };
    }
    score += 1;
    reasons.push("lines_exceeded");

    if (!this.hasCodeBlock(content)) {
      score += 1;
      reasons.push("no_code_block");
    }
    if (!this.hasDocUrl(content)) {
      score += 1;
      reasons.push("no_doc_url");
    }
    if (message.attachments.size === 0) {
      score += 1;
      reasons.push("no_attachments");
    }
    if (this.hasSuspiciousKeywords(content)) {
      score += 2;
      reasons.push("suspicious_keywords");
    }

    const accountAgeDays =
      (Date.now() - message.author.createdTimestamp) / 86400000;
    if (accountAgeDays < 7) {
      score += 2;
      reasons.push("new_account");
    } else if (accountAgeDays > 30) {
      score -= 1;
      reasons.push("established_account");
    }

    const joinedAt = message.member?.joinedTimestamp;
    if (joinedAt) {
      const joinAgeDays = (Date.now() - joinedAt) / 86400000;
      if (joinAgeDays < 3) {
        score += 1;
        reasons.push("recent_joiner");
      }
    }

    const roleCount = message.member?.roles.cache.size ?? 0;
    if (roleCount === 0) {
      score += 1;
      reasons.push("no_roles");
    } else if (roleCount >= 2) {
      score -= 1;
      reasons.push("multiple_roles");
    }

    if (this.hasCodeBlock(content)) score -= 2;
    if (this.hasDocUrl(content)) score -= 1;
    if (message.attachments.size > 0) score -= 1;

    return { score, reasons };
  }

  static async applyFilter(message: Message, client: Client): Promise<void> {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const config = await this.getConfig(guildId);
    if (!config.enabled) return;
    if (config.exemptChannels.has(message.channelId)) return;

    const { score, reasons } = await this.computeRiskScore(message, config);
    if (score < config.riskLimit) return;

    const lang = await LanguageService.getLanguage(guildId);
    const t = getTranslation(lang);

    const deleted = await safeDelete(message, t.linefilter.delete_reason);
    if (!deleted) {
      logger.warn(
        `Line filter wanted to delete ${message.id} but bot lacks perms`,
      );
      return;
    }

    ModActionService.logAction(
      guildId,
      "line_filter",
      message.author.id,
      null,
      t.linefilter.delete_reason,
      { score, reasons },
    );

    logger.warn(
      `Line filter triggered: user=${message.author.id} channel=${message.channelId} score=${score} reasons=${reasons.join(",")}`,
    );

    const logChannelId = await LogChannelService.getLogChannel(guildId);
    if (!logChannelId) return;

    const logChannel = await client.channels
      .fetch(logChannelId)
      .catch(() => null);
    if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

    const preview =
      message.content.length > 500
        ? message.content.substring(0, 500) + "..."
        : message.content || "*" + t.linefilter.log_no_content + "*";

    const embed = {
      color: 0xff6600,
      title: t.linefilter.log_title,
      fields: [
        {
          name: t.linefilter.log_user,
          value: `<@${message.author.id}> (${message.author.id})`,
          inline: true,
        },
        {
          name: t.linefilter.log_channel,
          value: `<#${message.channelId}>`,
          inline: true,
        },
        {
          name: t.linefilter.log_score,
          value: `${score} / ${config.riskLimit}`,
          inline: true,
        },
        {
          name: t.linefilter.log_reasons,
          value: reasons.map((r) => `\`${r}\``).join(", "),
          inline: false,
        },
        {
          name: t.linefilter.log_preview,
          value: preview,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    await logChannel
      .send({ embeds: [embed] })
      .catch((e) => logger.error("Failed to send linefilter log embed", e));
  }
}

function parseExemptChannels(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}
