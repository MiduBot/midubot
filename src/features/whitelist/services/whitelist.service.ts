import { db } from "@/db/connection";
import { whitelistsTable } from "@/db/schema";
import { appCache } from "@/core/cache";
import { and, eq } from "drizzle-orm";

export type WhitelistType = "role" | "member" | "permission";

const CACHE_PREFIX = "whitelist:";
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface WhitelistEntry {
  id: number;
  guildId: string;
  type: WhitelistType;
  entityId: string;
}

export class WhitelistService {
  static async getWhitelist(guildId: string): Promise<WhitelistEntry[]> {
    const cacheKey = `${CACHE_PREFIX}${guildId}`;
    const cached = appCache.get<WhitelistEntry[]>(cacheKey);
    if (cached) return cached;

    const list = await db.query.whitelistsTable.findMany({
      where: eq(whitelistsTable.guildId, guildId),
    });

    const typed = list.map((w) => ({
      id: w.id,
      guildId: w.guildId,
      type: w.type as WhitelistType,
      entityId: w.entityId,
    }));

    appCache.set(cacheKey, typed, CACHE_TTL_MS);
    return typed;
  }

  static async addWhitelist(
    guildId: string,
    type: WhitelistType,
    entityId: string,
  ): Promise<void> {
    const existing = await db.query.whitelistsTable.findFirst({
      where: and(
        eq(whitelistsTable.guildId, guildId),
        eq(whitelistsTable.type, type),
        eq(whitelistsTable.entityId, entityId),
      ),
    });

    if (existing) throw new Error("Already exists in whitelist");

    await db.insert(whitelistsTable).values({ guildId, type, entityId });
    appCache.delete(`${CACHE_PREFIX}${guildId}`);
  }

  static async removeWhitelist(guildId: string, entityId: string): Promise<void> {
    await db
      .delete(whitelistsTable)
      .where(
        and(
          eq(whitelistsTable.guildId, guildId),
          eq(whitelistsTable.entityId, entityId),
        ),
      );

    appCache.delete(`${CACHE_PREFIX}${guildId}`);
  }
}
