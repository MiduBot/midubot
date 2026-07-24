import { db } from "@/db/connection";
import { aiModPromptsTable } from "@/db/schema";

export class AiPromptsService {
  static async add(guildId: string, prompt: string): Promise<void> {
    await db.insert(aiModPromptsTable).values({ guildId, prompt });
  }
}
