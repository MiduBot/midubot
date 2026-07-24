import { db } from "@/db/connection";
import { aiModIgnoredChannelsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { appCache } from "@/core/cache";

const CACHE_PREFIX = "ignoredchannels:";
const CACHE_TTL_MS = 60 * 1000;

export interface IgnorableChannel {
  id: string;
  parentId: string | null;
}

/**
 * True when the channel (by id) or its parent category (by parentId) is in
 * the guild's `ai_mod_ignored_channels` table. Cached briefly to avoid
 * re-querying on every scanned channel.
 */
export async function isIgnored(
  guildId: string,
  channel: IgnorableChannel,
): Promise<boolean> {
  const cacheKey = `${CACHE_PREFIX}${guildId}`;
  let ids = appCache.get<Set<string>>(cacheKey);
  if (!ids) {
    const rows = await db.query.aiModIgnoredChannelsTable.findMany({
      where: eq(aiModIgnoredChannelsTable.guildId, guildId),
    });
    ids = new Set(rows.map((r) => r.targetId));
    appCache.set(cacheKey, ids, CACHE_TTL_MS);
  }
  if (ids.has(channel.id)) return true;
  if (channel.parentId && ids.has(channel.parentId)) return true;
  return false;
}

/** Invalidate the cache after a mutation (called by IgnoredChannelsService). */
export function invalidateIgnoredCache(guildId: string): void {
  appCache.delete(`${CACHE_PREFIX}${guildId}`);
}
