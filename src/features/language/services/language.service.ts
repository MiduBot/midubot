import { db } from "@/db/connection";
import { guildConfigsTable } from "@/db/schema";
import { appCache } from "@/core/cache";
import { logger } from "@/core/logger";
import { eq } from "drizzle-orm";
import type { Language } from "@/i18n";

const CACHE_PREFIX = "guild_lang:";

export class LanguageService {
  static async getLanguage(guildId: string): Promise<Language> {
    const cacheKey = `${CACHE_PREFIX}${guildId}`;
    const cached = appCache.get<Language>(cacheKey);
    if (cached) return cached;

    try {
      const config = await db.query.guildConfigsTable.findFirst({
        where: eq(guildConfigsTable.guildId, guildId),
      });
      const lang = (config?.language as Language) || "es";
      appCache.set(cacheKey, lang);
      return lang;
    } catch (error) {
      logger.error("Failed to load guild language, falling back to es", error);
      return "es";
    }
  }

  static async setLanguage(guildId: string, lang: Language): Promise<void> {
    await db
      .insert(guildConfigsTable)
      .values({ guildId, language: lang })
      .onConflictDoUpdate({
        target: guildConfigsTable.guildId,
        set: { language: lang },
      });

    appCache.set(`${CACHE_PREFIX}${guildId}`, lang);
  }
}
