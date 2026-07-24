import { db } from "@/db/connection";
import { modNotesTable } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";

export class ModNotesService {
  static async addNote(
    guildId: string,
    targetUserId: string,
    authorId: string,
    content: string,
  ) {
    const [row] = await db
      .insert(modNotesTable)
      .values({ guildId, targetUserId, authorId, content })
      .returning();
    return row;
  }

  static async getNotes(guildId: string, targetUserId: string, limit = 10) {
    return db.query.modNotesTable.findMany({
      where: and(
        eq(modNotesTable.guildId, guildId),
        eq(modNotesTable.targetUserId, targetUserId),
      ),
      orderBy: [desc(modNotesTable.createdAt)],
      limit,
    });
  }

  static async removeNote(id: number, guildId: string): Promise<boolean> {
    const result = await db
      .delete(modNotesTable)
      .where(and(eq(modNotesTable.id, id), eq(modNotesTable.guildId, guildId)));
    return (result.rowsAffected ?? 0) > 0;
  }

  static async countNotes(guildId: string, targetUserId: string): Promise<number> {
    const [row] = await db
      .select({ total: count() })
      .from(modNotesTable)
      .where(
        and(
          eq(modNotesTable.guildId, guildId),
          eq(modNotesTable.targetUserId, targetUserId),
        ),
      );
    return row?.total ?? 0;
  }
}
