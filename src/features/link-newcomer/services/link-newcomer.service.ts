import { db } from "@/db/connection";
import { guildConfigsTable } from "@/db/schema";
import { appCache } from "@/core/cache";
import { eq } from "drizzle-orm";

const CACHE_PREFIX = "linknewcomer:";
const CACHE_TTL_MS = 5 * 60 * 1000;

export const DEFAULT_LINK_NEWCOMER_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export interface LinkNewcomerConfig {
  enabled: boolean;
  thresholdMs: number;
}

export class LinkNewcomerService {
  static async getConfig(guildId: string): Promise<LinkNewcomerConfig> {
    const cacheKey = `${CACHE_PREFIX}${guildId}`;
    const cached = appCache.get<LinkNewcomerConfig>(cacheKey);
    if (cached) return cached;

    const row = await db.query.guildConfigsTable.findFirst({
      where: eq(guildConfigsTable.guildId, guildId),
    });

    const config: LinkNewcomerConfig = {
      enabled: row?.linkNewcomerEnabled ?? false,
      thresholdMs:
        row?.linkNewcomerThresholdMs ?? DEFAULT_LINK_NEWCOMER_THRESHOLD_MS,
    };

    appCache.set(cacheKey, config, CACHE_TTL_MS);
    return config;
  }

  static async setEnabled(guildId: string, enabled: boolean): Promise<void> {
    await db
      .insert(guildConfigsTable)
      .values({
        guildId,
        linkNewcomerEnabled: enabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: guildConfigsTable.guildId,
        set: { linkNewcomerEnabled: enabled, updatedAt: new Date() },
      });

    this.invalidate(guildId);
  }

  static async setThresholdMs(
    guildId: string,
    thresholdMs: number,
  ): Promise<void> {
    await db
      .insert(guildConfigsTable)
      .values({
        guildId,
        linkNewcomerThresholdMs: thresholdMs,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: guildConfigsTable.guildId,
        set: { linkNewcomerThresholdMs: thresholdMs, updatedAt: new Date() },
      });

    this.invalidate(guildId);
  }

  static invalidate(guildId: string): void {
    appCache.delete(`${CACHE_PREFIX}${guildId}`);
  }

  static isNewMember(
    joinedTimestamp: number,
    thresholdMs: number,
    now = Date.now(),
  ): boolean {
    return now - joinedTimestamp < thresholdMs;
  }
}
