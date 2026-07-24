import { db } from "@/db/connection";
import {
  aiModMaliciousMessagesTable,
  aiModPromptsTable,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

const MAX_EXAMPLES = 20; // up to 10 true + 10 false
const PER_SIDE = 10;
const MAX_EXAMPLE_CHARS = 200;
const MAX_PROMPTS = 50;

export class ContextBuilderService {
  static async buildContext(
    guildId: string,
  ): Promise<{ examples: string; prompts: string }> {
    const [trueRows, falseRows, promptRows] = await Promise.all([
      db.query.aiModMaliciousMessagesTable.findMany({
        where: and(
          eq(aiModMaliciousMessagesTable.guildId, guildId),
          eq(aiModMaliciousMessagesTable.malicious, true),
        ),
        orderBy: [desc(aiModMaliciousMessagesTable.createdAt)],
        limit: PER_SIDE,
      }),
      db.query.aiModMaliciousMessagesTable.findMany({
        where: and(
          eq(aiModMaliciousMessagesTable.guildId, guildId),
          eq(aiModMaliciousMessagesTable.malicious, false),
        ),
        orderBy: [desc(aiModMaliciousMessagesTable.createdAt)],
        limit: PER_SIDE,
      }),
      db.query.aiModPromptsTable.findMany({
        where: eq(aiModPromptsTable.guildId, guildId),
        orderBy: [desc(aiModPromptsTable.createdAt)],
        limit: MAX_PROMPTS,
      }),
    ]);

    const examples = [...trueRows, ...falseRows]
      .slice(0, MAX_EXAMPLES)
      .map((r) => {
        const tag = r.malicious ? "correcto" : "incorrecto";
        const verdict = r.malicious ? "MALICIOUS" : "CLEAN/SELFPROMO";
        const body = r.content.slice(0, MAX_EXAMPLE_CHARS);
        return `[${tag}] "${body}" → ${verdict}`;
      })
      .join("\n");

    const prompts = promptRows
      .map((p) => `- ${p.prompt}`)
      .join("\n");

    return { examples, prompts };
  }
}
