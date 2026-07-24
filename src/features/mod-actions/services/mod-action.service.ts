import { db } from "@/db/connection";
import { modActionsTable } from "@/db/schema";
import { eq, and, desc, sql, gte, count } from "drizzle-orm";
import { logger } from "@/core/logger";

export type ActionType =
  | "puff"
  | "report_quorum"
  | "image_duplicate"
  | "link_cooldown"
  | "link_newcomer"
  | "line_filter";

export class ModActionService {
  static async logAction(
    guildId: string,
    actionType: ActionType,
    targetUserId: string,
    executorId?: string | null,
    reason?: string | null,
    detail?: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      await db.insert(modActionsTable).values({
        guildId,
        actionType,
        executorId: executorId ?? null,
        targetUserId,
        reason: reason ?? null,
        detail: detail ? JSON.stringify(detail) : null,
      });
    } catch (e) {
      logger.error("Failed to log mod action", e);
    }
  }

  static async getHistory(
    guildId: string,
    targetUserId: string,
    limit = 10,
  ) {
    return db.query.modActionsTable.findMany({
      where: and(
        eq(modActionsTable.guildId, guildId),
        eq(modActionsTable.targetUserId, targetUserId),
      ),
      orderBy: [desc(modActionsTable.createdAt)],
      limit,
    });
  }

  static async getStats(guildId: string, since?: Date) {
    const conditions = [eq(modActionsTable.guildId, guildId)];
    if (since) {
      conditions.push(gte(modActionsTable.createdAt, since));
    }

    return db
      .select({
        actionType: modActionsTable.actionType,
        total: count(),
      })
      .from(modActionsTable)
      .where(and(...conditions))
      .groupBy(modActionsTable.actionType);
  }

  // ponytail: O(n) scan on targetUserId, add index if table grows past ~10k rows
  static async getTopTargets(guildId: string, since: Date, limit = 5) {
    return db
      .select({
        targetUserId: modActionsTable.targetUserId,
        total: count(),
      })
      .from(modActionsTable)
      .where(
        and(
          eq(modActionsTable.guildId, guildId),
          gte(modActionsTable.createdAt, since),
        ),
      )
      .groupBy(modActionsTable.targetUserId)
      .orderBy(sql`count(*) desc`)
      .limit(limit);
  }

  static async getTotalSince(guildId: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ total: count() })
      .from(modActionsTable)
      .where(
        and(
          eq(modActionsTable.guildId, guildId),
          gte(modActionsTable.createdAt, since),
        ),
      );
    return row?.total ?? 0;
  }
}
