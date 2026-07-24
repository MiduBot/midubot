import { db } from "@/db/connection";
import { aiModMaliciousMessagesTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export class MaliciousMessagesService {
  /** Inserts only if no row with (guildId, content) exists. */
  static async addIfAbsent(
    guildId: string,
    content: string,
    malicious: boolean,
  ): Promise<void> {
    const existing = await db.query.aiModMaliciousMessagesTable.findFirst({
      where: and(
        eq(aiModMaliciousMessagesTable.guildId, guildId),
        eq(aiModMaliciousMessagesTable.content, content),
      ),
    });
    if (existing) return;
    await db.insert(aiModMaliciousMessagesTable).values({ guildId, content, malicious });
  }
}
