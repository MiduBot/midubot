import { db } from "@/db/connection";
import { aiModNotifyTargetsTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type NotifyTargetType = "user" | "role";

export interface NotifyTargetRow {
  id: number;
  guildId: string;
  targetId: string;
  targetType: NotifyTargetType;
}

export class NotifyTargetsService {
  static async list(guildId: string): Promise<NotifyTargetRow[]> {
    const rows = await db.query.aiModNotifyTargetsTable.findMany({
      where: eq(aiModNotifyTargetsTable.guildId, guildId),
    });
    return rows.map((r) => ({
      id: r.id,
      guildId: r.guildId,
      targetId: r.targetId,
      targetType: r.targetType as NotifyTargetType,
    }));
  }

  static async add(
    guildId: string,
    targetId: string,
    targetType: NotifyTargetType,
  ): Promise<void> {
    const existing = await db.query.aiModNotifyTargetsTable.findFirst({
      where: and(
        eq(aiModNotifyTargetsTable.guildId, guildId),
        eq(aiModNotifyTargetsTable.targetId, targetId),
      ),
    });
    if (existing) throw new Error("Already a notify target");
    await db.insert(aiModNotifyTargetsTable).values({ guildId, targetId, targetType });
  }

  static async remove(guildId: string, targetId: string): Promise<void> {
    await db
      .delete(aiModNotifyTargetsTable)
      .where(
        and(
          eq(aiModNotifyTargetsTable.guildId, guildId),
          eq(aiModNotifyTargetsTable.targetId, targetId),
        ),
      );
  }
}
