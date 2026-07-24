import { db } from "@/db/connection";
import { aiModSelfpromoBypassChannelsTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface SelfpromoBypassRow {
  id: number;
  guildId: string;
  channelId: string;
}

export class SelfpromoBypassService {
  static async list(guildId: string): Promise<SelfpromoBypassRow[]> {
    const rows = await db.query.aiModSelfpromoBypassChannelsTable.findMany({
      where: eq(aiModSelfpromoBypassChannelsTable.guildId, guildId),
    });
    return rows.map((r) => ({ id: r.id, guildId: r.guildId, channelId: r.channelId }));
  }

  static async add(guildId: string, channelId: string): Promise<void> {
    const existing = await db.query.aiModSelfpromoBypassChannelsTable.findFirst({
      where: and(
        eq(aiModSelfpromoBypassChannelsTable.guildId, guildId),
        eq(aiModSelfpromoBypassChannelsTable.channelId, channelId),
      ),
    });
    if (existing) throw new Error("Already a bypass channel");
    await db.insert(aiModSelfpromoBypassChannelsTable).values({ guildId, channelId });
  }

  static async remove(guildId: string, channelId: string): Promise<void> {
    await db
      .delete(aiModSelfpromoBypassChannelsTable)
      .where(
        and(
          eq(aiModSelfpromoBypassChannelsTable.guildId, guildId),
          eq(aiModSelfpromoBypassChannelsTable.channelId, channelId),
        ),
      );
  }

  static async isBypass(guildId: string, channelId: string): Promise<boolean> {
    const row = await db.query.aiModSelfpromoBypassChannelsTable.findFirst({
      where: and(
        eq(aiModSelfpromoBypassChannelsTable.guildId, guildId),
        eq(aiModSelfpromoBypassChannelsTable.channelId, channelId),
      ),
    });
    return !!row;
  }
}
