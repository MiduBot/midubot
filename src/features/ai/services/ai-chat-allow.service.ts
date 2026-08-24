import type { Message } from "discord.js";
import { and, eq } from "drizzle-orm";
import { isSuperdev } from "@/config/env";
import { appCache } from "@/core/cache";
import { hasPermission } from "@/core/discord/permissions";
import { logger } from "@/core/logger";
import { db } from "@/db/connection";
import { aiChatAllowlistTable } from "@/db/schema";
import {
  canUseAiChat,
  isAllowSpecial,
  type AiChatAllowEntry,
  type AiChatAllowType,
} from "./ai-chat-allow";

export {
  canUseAiChat,
  type AiChatAllowEntry,
  type AiChatAllowSpecial,
  type AiChatAllowType,
  type CanUseAiChatInput,
} from "./ai-chat-allow";

const CACHE_PREFIX = "aichat-allow:";
const CACHE_TTL_MS = 60 * 60 * 1000;

function asEntry(row: {
  type: string;
  entityId: string;
}): AiChatAllowEntry | null {
  if (row.type === "member" || row.type === "role") {
    return { type: row.type, entityId: row.entityId };
  }
  if (row.type === "special" && isAllowSpecial(row.entityId)) {
    return { type: "special", entityId: row.entityId };
  }
  return null;
}

export class AiChatAllowService {
  static async list(guildId: string): Promise<AiChatAllowEntry[]> {
    const cacheKey = `${CACHE_PREFIX}${guildId}`;
    const cached = appCache.get<AiChatAllowEntry[]>(cacheKey);
    if (cached) return cached;

    const rows = await db.query.aiChatAllowlistTable.findMany({
      where: eq(aiChatAllowlistTable.guildId, guildId),
    });
    const list = rows.map(asEntry).filter((row): row is AiChatAllowEntry => row !== null);

    appCache.set(cacheKey, list, CACHE_TTL_MS);
    return list;
  }

  static async add(
    guildId: string,
    type: AiChatAllowType,
    entityId: string,
  ): Promise<"added" | "exists"> {
    const existing = await db.query.aiChatAllowlistTable.findFirst({
      where: and(
        eq(aiChatAllowlistTable.guildId, guildId),
        eq(aiChatAllowlistTable.type, type),
        eq(aiChatAllowlistTable.entityId, entityId),
      ),
    });
    if (existing) return "exists";

    await db.insert(aiChatAllowlistTable).values({ guildId, type, entityId });
    appCache.delete(`${CACHE_PREFIX}${guildId}`);
    logger.info(`AI chat allow added for guild ${guildId}: ${type}:${entityId}`);
    return "added";
  }

  static async remove(
    guildId: string,
    type: AiChatAllowType,
    entityId: string,
  ): Promise<boolean> {
    const existing = await db.query.aiChatAllowlistTable.findFirst({
      where: and(
        eq(aiChatAllowlistTable.guildId, guildId),
        eq(aiChatAllowlistTable.type, type),
        eq(aiChatAllowlistTable.entityId, entityId),
      ),
    });
    if (!existing) return false;

    await db
      .delete(aiChatAllowlistTable)
      .where(
        and(
          eq(aiChatAllowlistTable.guildId, guildId),
          eq(aiChatAllowlistTable.type, type),
          eq(aiChatAllowlistTable.entityId, entityId),
        ),
      );
    appCache.delete(`${CACHE_PREFIX}${guildId}`);
    logger.info(`AI chat allow removed for guild ${guildId}: ${type}:${entityId}`);
    return true;
  }

  static async clear(guildId: string): Promise<void> {
    await db
      .delete(aiChatAllowlistTable)
      .where(eq(aiChatAllowlistTable.guildId, guildId));
    appCache.delete(`${CACHE_PREFIX}${guildId}`);
    logger.info(`AI chat allow cleared for guild ${guildId}`);
  }

  static async canUse(message: Message): Promise<boolean> {
    const guildId = message.guild?.id;
    if (!guildId) return false;

    const authorId = message.author.id;
    const superdev = isSuperdev(authorId);
    if (superdev) return true;

    const entries = await this.list(guildId);
    if (entries.length === 0) return true;

    const needsMod = entries.some(
      (entry) => entry.type === "special" && entry.entityId === "mods",
    );

    return canUseAiChat({
      entries,
      authorId,
      isSuperdev: superdev,
      isMod: needsMod ? await hasPermission(message) : false,
      hasRole: (roleId) => message.member?.roles.cache.has(roleId) ?? false,
    });
  }
}
