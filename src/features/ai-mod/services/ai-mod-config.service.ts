import { db } from "@/db/connection";
import { guildConfigsTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export class AiModConfigService {
  static async isEnabled(guildId: string): Promise<boolean> {
    const row = await db.query.guildConfigsTable.findFirst({
      where: eq(guildConfigsTable.guildId, guildId),
    });
    return !!row?.aiModEnabled;
  }

  static async setEnabled(guildId: string, enabled: boolean): Promise<void> {
    const existing = await db.query.guildConfigsTable.findFirst({
      where: eq(guildConfigsTable.guildId, guildId),
    });
    if (existing) {
      await db
        .update(guildConfigsTable)
        .set({ aiModEnabled: enabled })
        .where(eq(guildConfigsTable.guildId, guildId));
    } else {
      await db.insert(guildConfigsTable).values({ guildId, aiModEnabled: enabled });
    }
  }
}
