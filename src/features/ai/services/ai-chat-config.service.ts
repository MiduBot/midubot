import { db } from "@/db/connection";
import { aiChatConfigTable } from "@/db/schema";
import { appCache } from "@/core/cache";
import { eq } from "drizzle-orm";
import { logger } from "@/core/logger";

const CACHE_PREFIX = "aichat:";

export interface AiChatConfig {
  enabled: boolean;
  channelId: string | null;
  mode: AiChatMode;
}

export type AiChatMode = "ambient" | "mentions";

const DISABLED: AiChatConfig = {
  enabled: false,
  channelId: null,
  mode: "ambient",
};

export class AiChatConfigService {
  static async getConfig(guildId: string): Promise<AiChatConfig> {
    const cacheKey = `${CACHE_PREFIX}${guildId}`;
    const cached = appCache.get<AiChatConfig>(cacheKey);
    if (cached) return cached;

    const row = await db.query.aiChatConfigTable.findFirst({
      where: eq(aiChatConfigTable.guildId, guildId),
    });

    const config: AiChatConfig = row
      ? {
          enabled: !!row.enabled,
          channelId: row.channelId ?? null,
          mode: row.mode === "mentions" ? "mentions" : "ambient",
        }
      : DISABLED;

    appCache.set(cacheKey, config);
    return config;
  }

  static async setEnabled(guildId: string, enabled: boolean): Promise<void> {
    const existing = await db.query.aiChatConfigTable.findFirst({
      where: eq(aiChatConfigTable.guildId, guildId),
    });

    if (existing) {
      await db
        .update(aiChatConfigTable)
        .set({ enabled })
        .where(eq(aiChatConfigTable.guildId, guildId));
    } else {
      await db.insert(aiChatConfigTable).values({ guildId, enabled });
    }

    appCache.delete(`${CACHE_PREFIX}${guildId}`);
    logger.info(`AI chat ${enabled ? "enabled" : "disabled"} for guild ${guildId}`);
  }

  static async setChannel(guildId: string, channelId: string): Promise<void> {
    const existing = await db.query.aiChatConfigTable.findFirst({
      where: eq(aiChatConfigTable.guildId, guildId),
    });

    if (existing) {
      await db
        .update(aiChatConfigTable)
        .set({ channelId })
        .where(eq(aiChatConfigTable.guildId, guildId));
    } else {
      await db.insert(aiChatConfigTable).values({
        guildId,
        enabled: false,
        channelId,
      });
    }

    appCache.delete(`${CACHE_PREFIX}${guildId}`);
    logger.info(`AI chat channel set for guild ${guildId}: ${channelId}`);
  }

  static async clearChannel(guildId: string): Promise<void> {
    const existing = await db.query.aiChatConfigTable.findFirst({
      where: eq(aiChatConfigTable.guildId, guildId),
    });
    if (!existing) {
      appCache.delete(`${CACHE_PREFIX}${guildId}`);
      return;
    }

    await db
      .update(aiChatConfigTable)
      .set({ channelId: null })
      .where(eq(aiChatConfigTable.guildId, guildId));

    appCache.delete(`${CACHE_PREFIX}${guildId}`);
    logger.info(`AI chat channel cleared for guild ${guildId}`);
  }

  static async setMode(guildId: string, mode: AiChatMode): Promise<void> {
    const existing = await db.query.aiChatConfigTable.findFirst({
      where: eq(aiChatConfigTable.guildId, guildId),
    });

    if (existing) {
      await db
        .update(aiChatConfigTable)
        .set({ mode })
        .where(eq(aiChatConfigTable.guildId, guildId));
    } else {
      await db.insert(aiChatConfigTable).values({
        guildId,
        enabled: false,
        mode,
      });
    }

    appCache.delete(`${CACHE_PREFIX}${guildId}`);
    logger.info(`AI chat mode set for guild ${guildId}: ${mode}`);
  }
}
