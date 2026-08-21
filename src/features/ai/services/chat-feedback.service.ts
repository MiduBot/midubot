import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/connection";
import { aiChatFeedbackTable } from "@/db/schema";

export type ChatFeedbackRating = "up" | "down";
export type ChatFeedbackResult =
  | "recorded"
  | "not_found"
  | "forbidden"
  | "already_rated";

export interface ChatResponseMetrics {
  requestMessageId: string;
  responseMessageId: string;
  guildId: string;
  channelId: string;
  requesterId: string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: string;
}

export class ChatFeedbackService {
  static async record(metrics: ChatResponseMetrics): Promise<void> {
    await db.insert(aiChatFeedbackTable).values({
      ...metrics,
      createdAt: new Date(),
    });
  }

  static async rate(
    requestMessageId: string,
    userId: string,
    rating: ChatFeedbackRating,
  ): Promise<ChatFeedbackResult> {
    const row = await db.query.aiChatFeedbackTable.findFirst({
      where: eq(aiChatFeedbackTable.requestMessageId, requestMessageId),
    });
    if (!row) return "not_found";
    if (row.requesterId !== userId) return "forbidden";
    if (row.rating) return "already_rated";

    const result = await db
      .update(aiChatFeedbackTable)
      .set({ rating, ratedBy: userId, ratedAt: new Date() })
      .where(
        and(
          eq(aiChatFeedbackTable.requestMessageId, requestMessageId),
          isNull(aiChatFeedbackTable.rating),
        ),
      );
    return Number(
      (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0,
    ) > 0
      ? "recorded"
      : "already_rated";
  }
}
