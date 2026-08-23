import { db } from "@/db/connection";
import { moderationFeatureConfigsTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { ModerationFeature, ModerationMode } from "../types";

export class ModerationConfigService {
  static async getMode(
    guildId: string,
    feature: ModerationFeature,
  ): Promise<ModerationMode> {
    const row = await db.query.moderationFeatureConfigsTable.findFirst({
      where: and(
        eq(moderationFeatureConfigsTable.guildId, guildId),
        eq(moderationFeatureConfigsTable.feature, feature),
      ),
      columns: { mode: true },
    });
    return (row?.mode as ModerationMode | undefined) ?? "shadow";
  }

  static async setMode(
    guildId: string,
    feature: ModerationFeature,
    mode: ModerationMode,
  ): Promise<void> {
    const updatedAt = new Date();
    await db
      .insert(moderationFeatureConfigsTable)
      .values({ guildId, feature, mode, updatedAt })
      .onConflictDoUpdate({
        target: [
          moderationFeatureConfigsTable.guildId,
          moderationFeatureConfigsTable.feature,
        ],
        set: { mode, updatedAt },
      });
  }
}
