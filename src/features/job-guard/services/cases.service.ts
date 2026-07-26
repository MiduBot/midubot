import { db } from "@/db/connection";
import { jobGuardCasesTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export type FeedbackAction = "correct" | "incorrect";

export interface CaseInsertPayload {
  guildId: string;
  authorId: string;
  channelId: string;
  messageId: string;
  content: string;
  verdict: string;
  confidence: number;
  reason: string;
  deleted: boolean;
}

export interface CaseRow extends CaseInsertPayload {
  id: number;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAction: string | null;
  feedbackAction: string | null;
  promptPending: boolean;
  promptError: string | null;
}

export class JobGuardCasesService {
  static async insert(payload: CaseInsertPayload): Promise<number> {
    const result = (await db.insert(jobGuardCasesTable).values({
      ...payload,
      createdAt: new Date(),
    })) as unknown as { lastInsertRowid?: bigint | number };
    const id = result?.lastInsertRowid;
    if (typeof id === "bigint") return Number(id);
    if (typeof id === "number") return id;
    return 0;
  }

  static async get(id: number): Promise<CaseRow | null> {
    const row = await db.query.jobGuardCasesTable.findFirst({
      where: eq(jobGuardCasesTable.id, id),
    });
    return (row as unknown as CaseRow) ?? null;
  }

  static async markFeedbackPending(
    id: number,
    resolvedBy: string,
    feedbackAction: FeedbackAction,
    promptError?: string | null,
  ): Promise<void> {
    await db
      .update(jobGuardCasesTable)
      .set({
        feedbackAction,
        promptPending: true,
        promptError: promptError ?? "AI unavailable",
        resolvedBy,
      })
      .where(eq(jobGuardCasesTable.id, id));
  }

  static async markResolved(
    id: number,
    resolvedBy: string,
    resolvedAction: FeedbackAction,
  ): Promise<void> {
    await db
      .update(jobGuardCasesTable)
      .set({
        resolved: true,
        resolvedBy,
        resolvedAction,
        feedbackAction: resolvedAction,
        resolvedAt: new Date(),
        promptPending: false,
        promptError: null,
      })
      .where(eq(jobGuardCasesTable.id, id));
  }
}
