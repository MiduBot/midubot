import { db } from "@/db/connection";
import { logChannelsTable } from "@/db/schema";
import { appCache } from "@/core/cache";
import { eq } from "drizzle-orm";
import { logger } from "@/core/logger";

const CACHE_PREFIX = "logchannel:";

export class LogChannelService {
  static async setLogChannel(guildId: string, channelId: string): Promise<void> {
    const existing = await db.query.logChannelsTable.findFirst({
      where: eq(logChannelsTable.guildId, guildId),
    });

    if (existing) {
      await db
        .update(logChannelsTable)
        .set({ channelId })
        .where(eq(logChannelsTable.guildId, guildId));
    } else {
      await db.insert(logChannelsTable).values({ guildId, channelId });
    }

    appCache.set(`${CACHE_PREFIX}${guildId}`, channelId);
    logger.info(`Log channel set for guild ${guildId}: ${channelId}`);
  }

  static async getLogChannel(guildId: string): Promise<string | null> {
    const cacheKey = `${CACHE_PREFIX}${guildId}`;
    const cached = appCache.get<string>(cacheKey);
    if (cached) return cached;

    const record = await db.query.logChannelsTable.findFirst({
      where: eq(logChannelsTable.guildId, guildId),
    });

    if (record) {
      appCache.set(cacheKey, record.channelId);
      return record.channelId;
    }

    return null;
  }

  static async removeLogChannel(guildId: string): Promise<void> {
    await db
      .delete(logChannelsTable)
      .where(eq(logChannelsTable.guildId, guildId));

    appCache.delete(`${CACHE_PREFIX}${guildId}`);
    logger.info(`Log channel removed for guild ${guildId}`);
  }
}
