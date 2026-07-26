import { db } from "@/db/connection";
import { jobGuardPromptsTable } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

const MAX_PROMPT_LENGTH = 300;

export class JobGuardPromptsService {
  static async add(guildId: string, prompt: string): Promise<void> {
    const stored = prompt.slice(0, MAX_PROMPT_LENGTH);
    await db.insert(jobGuardPromptsTable).values({
      guildId,
      prompt: stored,
      createdAt: new Date(),
    });
  }

  static async listRecent(
    guildId: string,
    limit: number,
  ): Promise<{ prompt: string }[]> {
    try {
      const rows = await db.query.jobGuardPromptsTable.findMany({
        where: eq(jobGuardPromptsTable.guildId, guildId),
        orderBy: [desc(jobGuardPromptsTable.createdAt)],
        limit,
      });
      return rows.map((r) => ({ prompt: r.prompt }));
    } catch {
      return [];
    }
  }
}
