import { db } from "@/db/connection";
import { aiModIgnoredChannelsTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { invalidateIgnoredCache } from "@/core/discord/ignored-channels";

export type IgnoredTargetType = "channel" | "category";

export interface IgnoredChannelRow {
  id: number;
  guildId: string;
  targetId: string;
  targetType: IgnoredTargetType;
}

export class IgnoredChannelsService {
  static async list(guildId: string): Promise<IgnoredChannelRow[]> {
    const rows = await db.query.aiModIgnoredChannelsTable.findMany({
      where: eq(aiModIgnoredChannelsTable.guildId, guildId),
    });
    return rows.map((r) => ({
      id: r.id,
      guildId: r.guildId,
      targetId: r.targetId,
      targetType: r.targetType as IgnoredTargetType,
    }));
  }

  static async add(
    guildId: string,
    targetId: string,
    targetType: IgnoredTargetType,
  ): Promise<void> {
    const existing = await db.query.aiModIgnoredChannelsTable.findFirst({
      where: and(
        eq(aiModIgnoredChannelsTable.guildId, guildId),
        eq(aiModIgnoredChannelsTable.targetId, targetId),
      ),
    });
    if (existing) throw new Error("Already ignored");

    await db.insert(aiModIgnoredChannelsTable).values({ guildId, targetId, targetType });
    invalidateIgnoredCache(guildId);
  }

  static async remove(guildId: string, targetId: string): Promise<void> {
    await db
      .delete(aiModIgnoredChannelsTable)
      .where(
        and(
          eq(aiModIgnoredChannelsTable.guildId, guildId),
          eq(aiModIgnoredChannelsTable.targetId, targetId),
        ),
      );
    invalidateIgnoredCache(guildId);
  }
}
