import { db } from "@/db/connection";
import { uniqueChannelsTable, uniqueMessagesTable } from "@/db/schema";
import { appCache } from "@/core/cache";
import { and, eq } from "drizzle-orm";
import { logger } from "@/core/logger";

const CACHE_PREFIX = "unique:";

export interface UniqueChannelConfig {
  channelId: string;
  emoji: string;
}

export class UniqueChannelService {
  static async getConfig(
    guildId: string,
  ): Promise<UniqueChannelConfig | null> {
    const cacheKey = `${CACHE_PREFIX}config:${guildId}`;
    const cached = appCache.get<UniqueChannelConfig>(cacheKey);
    if (cached !== null) return cached;

    try {
      const row = await db.query.uniqueChannelsTable.findFirst({
        where: eq(uniqueChannelsTable.guildId, guildId),
      });

      const config: UniqueChannelConfig | null = row
        ? { channelId: row.channelId, emoji: row.emoji }
        : null;

      if (config) appCache.set(cacheKey, config, 5 * 60 * 1000);
      return config;
    } catch (error) {
      logger.error("Failed to get unique channel config", error);
      return null;
    }
  }

  static async setChannel(guildId: string, channelId: string): Promise<void> {
    const existing = await db.query.uniqueChannelsTable.findFirst({
      where: eq(uniqueChannelsTable.guildId, guildId),
    });

    if (existing) {
      await db
        .update(uniqueChannelsTable)
        .set({ channelId })
        .where(eq(uniqueChannelsTable.guildId, guildId));
    } else {
      await db.insert(uniqueChannelsTable).values({
        guildId,
        channelId,
        emoji: "✅",
      });
    }

    await db
      .delete(uniqueMessagesTable)
      .where(eq(uniqueMessagesTable.guildId, guildId));

    appCache.delete(`${CACHE_PREFIX}config:${guildId}`);
    logger.info(`Unique channel set to ${channelId} for guild ${guildId}`);
  }

  static async setEmoji(guildId: string, emoji: string): Promise<void> {
    const existing = await db.query.uniqueChannelsTable.findFirst({
      where: eq(uniqueChannelsTable.guildId, guildId),
    });

    if (!existing) {
      throw new Error("No unique channel configured for this server.");
    }

    await db
      .update(uniqueChannelsTable)
      .set({ emoji })
      .where(eq(uniqueChannelsTable.guildId, guildId));

    appCache.delete(`${CACHE_PREFIX}config:${guildId}`);
    logger.info(`Unique emoji set to ${emoji} for guild ${guildId}`);
  }

  static async getUserMessage(
    guildId: string,
    userId: string,
  ): Promise<string | null> {
    try {
      const row = await db.query.uniqueMessagesTable.findFirst({
        where: and(
          eq(uniqueMessagesTable.guildId, guildId),
          eq(uniqueMessagesTable.userId, userId),
        ),
      });
      return row?.messageId ?? null;
    } catch (error) {
      logger.error("Failed to get user message", error);
      return null;
    }
  }

  static async setUserMessage(
    guildId: string,
    userId: string,
    messageId: string,
  ): Promise<void> {
    try {
      await db
        .insert(uniqueMessagesTable)
        .values({ guildId, userId, messageId })
        .onConflictDoUpdate({
          target: [uniqueMessagesTable.guildId, uniqueMessagesTable.userId],
          set: { messageId },
        });
    } catch (error) {
      logger.error("Failed to set user message", error);
      throw error;
    }
  }

  static async resetUser(
    guildId: string,
    userId: string,
  ): Promise<{ deleted: boolean }> {
    try {
      const row = await db.query.uniqueMessagesTable.findFirst({
        where: and(
          eq(uniqueMessagesTable.guildId, guildId),
          eq(uniqueMessagesTable.userId, userId),
        ),
      });

      if (!row) {
        return { deleted: false };
      }

      await db
        .delete(uniqueMessagesTable)
        .where(
          and(
            eq(uniqueMessagesTable.guildId, guildId),
            eq(uniqueMessagesTable.userId, userId),
          ),
        );

      appCache.delete(`${CACHE_PREFIX}config:${guildId}`);
      return { deleted: true };
    } catch (error) {
      logger.error("Failed to reset user", error);
      throw error;
    }
  }
}
