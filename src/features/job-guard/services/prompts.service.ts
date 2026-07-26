import { db } from "@/db/connection";
import { jobGuardPromptsTable } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export class JobGuardPromptsService {
  static async add(guildId: string, prompt: string): Promise<void> {
    await db.insert(jobGuardPromptsTable).values({ guildId, prompt });
  }

  static async listRecent(
    guildId: string,
    limit: number,
  ): Promise<{ prompt: string }[]> {
    const rows = await db.query.jobGuardPromptsTable.findMany({
      where: eq(jobGuardPromptsTable.guildId, guildId),
      orderBy: [desc(jobGuardPromptsTable.createdAt)],
      limit,
    });
    return rows.map((r) => ({ prompt: r.prompt }));
  }
}
